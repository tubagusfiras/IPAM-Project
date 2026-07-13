#!/usr/bin/env python3
"""
Global Ping Visibility — Oracle Cloud Agent
Deploy di Oracle Cloud Free Tier (Ampere A1, Ubuntu 22.04).

Cara deploy:
  scp oracle-ping-agent.py opc@<oracle-vm-ip>:/home/opc/
  ssh opc@<oracle-vm-ip>
  python3 oracle-ping-agent.py --server http://103.10.120.11:8101 --token <your-api-key>

Agent ini akan:
  1. Menerima list IP dari server IPAM
  2. ICMP ping dari region Oracle (US/SG/EU)
  3. Report hasil back ke server IPAM via API
"""

import asyncio
import platform
import time
import json
import urllib.request
import urllib.parse
import sys

SERVER_URL = "http://103.10.120.11:8101"
API_KEY = ""
LOCATION = platform.node() or "oracle-cloud"
PING_TIMEOUT = 3
MAX_CONCURRENT = 20

async def icmp_ping(ip: str) -> dict:
    try:
        start = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c1", "-W", str(PING_TIMEOUT), ip,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=PING_TIMEOUT + 1)
        except asyncio.TimeoutError:
            proc.kill()
            return {"status": "offline", "rtt_ms": None}
        elapsed = (time.monotonic() - start) * 1000
        if proc.returncode == 0:
            return {"status": "online", "rtt_ms": round(elapsed, 1)}
        return {"status": "offline", "rtt_ms": None}
    except:
        return {"status": "error", "rtt_ms": None}


async def scan_batch(ips: list[str]) -> list[dict]:
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    async def _ping(ip):
        async with sem:
            r = await icmp_ping(ip)
            r["ip"] = ip
            return r
    return await asyncio.gather(*[_ping(ip) for ip in ips])


def report_results(results: list[dict]):
    url = f"{SERVER_URL}/api/v1/ping/report"
    data = json.dumps({"results": results, "source": LOCATION, "api_key": API_KEY}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
        print(f"  Reported {len(results)} results")
    except Exception as e:
        print(f"  Report failed: {e}")


def fetch_ips() -> list[str]:
    url = f"{SERVER_URL}/api/v1/ping/status?limit=2000&status=all"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return [i["ip"] for i in data.get("items", []) if i.get("ip")]
    except:
        return []


async def main():
    global API_KEY, SERVER_URL
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--server" and i + 2 < len(sys.argv):
            SERVER_URL = sys.argv[i + 2]
        elif arg == "--token" and i + 2 < len(sys.argv):
            API_KEY = sys.argv[i + 2]

    print(f"Global Ping Agent — {LOCATION}")
    print(f"Server: {SERVER_URL}")
    print(f"Ping timeout: {PING_TIMEOUT}s | Max concurrent: {MAX_CONCURRENT}")

    while True:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Fetching IP list...")
        ips = fetch_ips()
        print(f"  Got {len(ips)} IPs to scan")

        if ips:
            # Scan in batches
            batch_size = 50
            for i in range(0, len(ips), batch_size):
                batch = ips[i:i + batch_size]
                print(f"  Batch {i//batch_size + 1}/{(len(ips)-1)//batch_size + 1}: scanning {len(batch)} IPs...")
                results = await scan_batch(batch)
                report_results(results)
                await asyncio.sleep(0.5)

        print(f"  Scan cycle complete. Waiting 6 hours...")
        await asyncio.sleep(21600)  # 6 jam


if __name__ == "__main__":
    asyncio.run(main())
