#!/usr/bin/env python3
"""
IPAM Global Ping Agent — Multi-Region
Menjalankan ICMP ping dari lokasi agent (Oracle Cloud SG/US)
dan mengirim hasil ke IPAM server.

Usage:
    # Set environment variables
    export IPAM_SERVER="http://103.10.120.11:8101"
    export IPAM_API_KEY="your-api-key-here"
    export AGENT_SOURCE="oracle_sg"  # atau "oracle_us"

    # Run once
    python3 ping_agent.py

    # Run as daemon (set interval detik)
    python3 ping_agent.py --interval 300

    # Install as systemd service
    sudo cp ping-agent.service /etc/systemd/system/
    sudo systemctl enable --now ping-agent
"""

import os
import sys
import time
import json
import argparse
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

# ── Configuration ─────────────────────────────────────────────
IPAM_SERVER = os.environ.get("IPAM_SERVER", "http://103.10.120.11:8101")
IPAM_API_KEY = os.environ.get("IPAM_API_KEY", "")
AGENT_SOURCE = os.environ.get("AGENT_SOURCE", "oracle_sg")  # oracle_sg / oracle_us
PING_TIMEOUT = int(os.environ.get("PING_TIMEOUT", "3"))  # detik
PING_COUNT = int(os.environ.get("PING_COUNT", "3"))  # jumlah ping per IP
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "50"))  # IP per batch
DEFAULT_INTERVAL = int(os.environ.get("INTERVAL", "300"))  # 5 menit

LOG_FILE = os.environ.get("LOG_FILE", "/var/log/ping-agent.log")


def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def api_request(path: str, method: str = "GET", data: dict = None) -> dict:
    """Request ke IPAM API dengan API key auth."""
    url = f"{IPAM_SERVER}{path}"
    headers = {"Content-Type": "application/json"}
    if IPAM_API_KEY:
        headers["X-API-Key"] = IPAM_API_KEY

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"API error: {e}", "ERROR")
        return {}


def get_active_ips() -> list[dict]:
    """Ambil daftar IP aktif dari IPAM."""
    data = api_request("/api/v1/ping/active-ips")
    return data.get("items", [])


def ping_ip(ip: str) -> dict:
    """Ping satu IP, return status dan RTT."""
    try:
        result = subprocess.run(
            ["ping", "-c", str(PING_COUNT), "-W", str(PING_TIMEOUT), ip],
            capture_output=True, text=True, timeout=PING_TIMEOUT * PING_COUNT + 5
        )
        if result.returncode == 0:
            # Parse RTT dari output ping
            # rtt min/avg/max/mdev = 1.234/2.345/3.456/0.123 ms
            for line in result.stdout.split("\n"):
                if "rtt" in line or "round-trip" in line:
                    parts = line.split("=")[-1].strip().split("/")
                    if len(parts) >= 2:
                        return {"ip": ip, "status": "online", "rtt_ms": float(parts[1])}
            return {"ip": ip, "status": "online", "rtt_ms": None}
        else:
            return {"ip": ip, "status": "offline", "rtt_ms": None}
    except Exception as e:
        return {"ip": ip, "status": "error", "rtt_ms": None}


def send_report(results: list[dict]):
    """Kirim hasil ping ke IPAM server."""
    if not results:
        return

    data = {"source": AGENT_SOURCE, "results": results}
    resp = api_request("/api/v1/ping/report", method="POST", data=data)
    log(f"Report sent: {resp.get('updated', 0)}/{len(results)} updated from {AGENT_SOURCE}")


def run_cycle():
    """Satu siklus: ambil IP → ping → kirim report."""
    log(f"Starting ping cycle from {AGENT_SOURCE}")

    # Ambil IP list
    ips = get_active_ips()
    if not ips:
        log("No active IPs found, skipping cycle", "WARN")
        return

    log(f"Found {len(ips)} active IPs to ping")

    # Ping dalam batch
    all_results = []
    for i in range(0, len(ips), BATCH_SIZE):
        batch = ips[i:i + BATCH_SIZE]
        batch_results = []
        for item in batch:
            ip = item.get("ip")
            if not ip:
                continue
            result = ping_ip(ip)
            batch_results.append(result)
            # Status indicator
            status_char = "✓" if result["status"] == "online" else "✗"
            rtt = f" ({result['rtt_ms']:.1f}ms)" if result.get("rtt_ms") else ""
            print(f"  {status_char} {ip}{rtt}", end="", flush=True)
        print()  # newline after batch

        all_results.extend(batch_results)

        # Kirim per batch
        send_report(batch_results)

    online = sum(1 for r in all_results if r["status"] == "online")
    offline = sum(1 for r in all_results if r["status"] == "offline")
    error = sum(1 for r in all_results if r["status"] == "error")
    log(f"Cycle complete: {online} online, {offline} offline, {error} error out of {len(all_results)} IPs")


def main():
    parser = argparse.ArgumentParser(description="IPAM Global Ping Agent")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help="Interval antar siklus (detik)")
    parser.add_argument("--once", action="store_true", help="Jalan sekali saja")
    args = parser.parse_args()

    log(f"IPAM Ping Agent started — source: {AGENT_SOURCE}, server: {IPAM_SERVER}")

    if not IPAM_API_KEY:
        log("WARNING: IPAM_API_KEY not set, API requests may fail", "WARN")

    if args.once:
        run_cycle()
    else:
        while True:
            try:
                run_cycle()
            except Exception as e:
                log(f"Cycle error: {e}", "ERROR")
            log(f"Sleeping {args.interval}s until next cycle...")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
