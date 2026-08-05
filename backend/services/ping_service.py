"""
Global Ping Visibility — Ping Engine
- ICMP ping dari server lokal (asyncio subprocess)
- HTTP ping via Cloudflare Workers (global edge)
- Check-host.net (multi-region ping)
"""

import asyncio
import platform
import time
import aiohttp
from typing import Optional

# ── Config ──
PING_TIMEOUT = 2          # detik per ping
MAX_CONCURRENT = 40        # max parallel ping
CF_WORKER_URL = "https://ipam-global-ping.intermerda900.workers.dev/ping"
CHECK_HOST_BASE = "https://check-host.net"
CHECK_HOST_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "IPAM-SDI/3.0 (network monitoring)",
}
# Rate limit: check-host.net max ~30 req/jam, jadi 1 req per 2 detik aman
CH_RATE_DELAY = 2.0  # detik antar request

# ── ICMP Ping (dari server lokal) ──
async def icmp_ping(ip: str, timeout: int = PING_TIMEOUT) -> dict:
    """Ping 1 IP, return {status, rtt_ms}"""
    try:
        # Platform-specific ping args
        if platform.system().lower() == "windows":
            cmd = ["ping", "-n", "1", "-w", str(timeout * 1000), ip]
        else:
            cmd = ["ping", "-c1", "-W", str(timeout), ip]

        start = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=timeout + 1)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return {"status": "offline", "rtt_ms": None}

        elapsed = (time.monotonic() - start) * 1000  # ms

        if proc.returncode == 0:
            return {"status": "online", "rtt_ms": round(elapsed, 1)}
        return {"status": "offline", "rtt_ms": None}

    except Exception as e:
        return {"status": "error", "rtt_ms": None, "error": str(e)}


async def icmp_ping_batch(ips: list[str]) -> list[dict]:
    """Ping banyak IP, max concurrent"""
    sem = asyncio.Semaphore(MAX_CONCURRENT)

    async def _ping(ip):
        async with sem:
            result = await icmp_ping(ip)
            result["ip"] = ip
            return result

    tasks = [_ping(ip) for ip in ips]
    return await asyncio.gather(*tasks)


# ── HTTP Ping via Cloudflare Worker ──
async def http_ping_via_worker(ip: str, worker_url: str = CF_WORKER_URL) -> dict:
    """Panggil Cloudflare Worker untuk HTTP check dari multi edge"""
    if not worker_url or "your-worker" in worker_url:
        return {"status": "pending", "rtt_ms": None, "locations": [], "note": "CF Worker not configured"}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{worker_url}?target={ip}",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data
                return {"status": "error", "rtt_ms": None, "locations": [], "error": f"HTTP {resp.status}"}
    except Exception as e:
        return {"status": "error", "rtt_ms": None, "locations": [], "error": str(e)}


async def http_ping_batch(ips: list[str]) -> list[dict]:
    """HTTP ping batch via CF Worker"""
    sem = asyncio.Semaphore(5)  # limit ke CF

    async def _check(ip):
        async with sem:
            result = await http_ping_via_worker(ip)
            result["ip"] = ip
            return result

    tasks = [_check(ip) for ip in ips]
    return await asyncio.gather(*tasks)


# ── Full Scan (ICMP + HTTP) ──
async def full_scan(ips: list[str]) -> dict:
    """Run ICMP + HTTP scan untuk semua IP, return aggregated"""
    icmp_results = await icmp_ping_batch(ips)
    http_results = await http_ping_batch(ips)

    # Map by IP
    icmp_map = {r["ip"]: r for r in icmp_results}
    http_map = {r["ip"]: r for r in http_results}

    combined = {}
    for ip in ips:
        icmp = icmp_map.get(ip, {})
        http = http_map.get(ip, {})

        # Determine final status
        icmp_online = icmp.get("status") == "online"
        http_online = http.get("status") == "online"

        if icmp_online or http_online:
            final = "online"
        elif icmp.get("status") == "error" and http.get("status") == "error":
            final = "error"
        else:
            final = "offline"

        combined[ip] = {
            "ip": ip,
            "final_status": final,
            "icmp": icmp.get("status"),
            "icmp_rtt": icmp.get("rtt_ms"),
            "http": http.get("status"),
            "http_rtt": http.get("rtt_ms"),
            "http_locations": http.get("locations", []),
            "scanned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    return {
        "results": combined,
        "summary": {
            "total": len(ips),
            "online": sum(1 for v in combined.values() if v["final_status"] == "online"),
            "offline": sum(1 for v in combined.values() if v["final_status"] == "offline"),
            "error": sum(1 for v in combined.values() if v["final_status"] == "error"),
        }
    }


# ── Check-host.net (multi-region ping) ──
# Global rate limiter: 1 request per CH_RATE_DELAY seconds
_ch_rate_lock = asyncio.Lock()
_ch_last_request = 0.0

async def check_host_ping(ip: str, timeout: int = 30) -> dict:
    """Ping IP via check-host.net from multiple global regions.
    Returns {regions: [{country_code, country_name, status}], request_id}"""
    global _ch_last_request
    try:
        # Rate limit: tunggu minimal CH_RATE_DELAY antar request
        async with _ch_rate_lock:
            now = time.monotonic()
            wait = CH_RATE_DELAY - (now - _ch_last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            _ch_last_request = time.monotonic()

        async with aiohttp.ClientSession(headers=CHECK_HOST_HEADERS) as session:
            # Start check
            url = f"{CHECK_HOST_BASE}/check-ping?host={ip}"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return {"regions": [], "error": f"HTTP {resp.status}"}
                data = await resp.json()

            request_id = data.get("request_id")
            nodes = data.get("nodes", {})

            if not request_id:
                return {"regions": [], "error": "no request_id"}

            # Wait for results (poll up to timeout seconds)
            result_url = f"{CHECK_HOST_BASE}/check-result/{request_id}"
            for _ in range(timeout // 3):
                await asyncio.sleep(3)
                async with session.get(result_url, timeout=aiohttp.ClientTimeout(total=10)) as rresp:
                    if rresp.status != 200:
                        continue
                    results = await rresp.json()

                if not results:
                    continue

                # Parse results: {node_name: [[time, status], ...]}
                regions = []
                for node_name, checks in results.items():
                    node_info = nodes.get(node_name, [])
                    country_code = node_info[0] if len(node_info) > 0 else "??"
                    country_name = node_info[1] if len(node_info) > 1 else "Unknown"

                    # Status: any successful check = online
                    statuses = [c[1] for c in checks if c] if isinstance(checks, list) else []
                    is_online = any(s == 1 for s in statuses) if statuses else False
                    regions.append({
                        "country_code": country_code,
                        "country_name": country_name,
                        "status": "online" if is_online else "offline",
                    })

                return {"regions": regions, "request_id": request_id}

            return {"regions": [], "error": "timeout waiting for check-host.net results"}

    except Exception as e:
        return {"regions": [], "error": str(e)}
