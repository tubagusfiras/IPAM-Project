"""
Global Ping Visibility — Ping Engine
- ICMP ping dari server lokal (asyncio subprocess)
- HTTP ping via Cloudflare Workers (global edge)
- Oracle VPS agents (future)
"""

import asyncio
import platform
import time
import aiohttp
from typing import Optional

# ── Config ──
PING_TIMEOUT = 3          # detik per ping
MAX_CONCURRENT = 20        # max parallel ping
CF_WORKER_URL = "https://ipam-global-ping.intermerda900.workers.dev/ping"

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
