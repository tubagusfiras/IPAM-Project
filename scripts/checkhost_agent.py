#!/usr/bin/env python3
"""
IPAM Check-Host.net Agent — Multi-Region ICMP Ping
Menggunakan check-host.net API untuk ping IP dari 50+ lokasi global.

API: https://check-host.net/
Docs: https://check-host.net/pages/api

Usage:
    export IPAM_SERVER="http://103.10.120.11:8101"
    export IPAM_API_KEY="your-api-key-here"
    export CHECKHOST_TOKEN="your-check-host-token"

    # Run once
    python3 checkhost_agent.py --once

    # Run daemon (5 menit interval)
    python3 checkhost_agent.py --interval 300

    # Export results to CSV
    python3 checkhost_agent.py --once --export results.csv
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Configuration ─────────────────────────────────────────────
IPAM_SERVER = os.environ.get("IPAM_SERVER", "http://103.10.120.11:8101")
IPAM_API_KEY = os.environ.get("IPAM_API_KEY", "")
CHECKHOST_API = "https://check-host.net"
CHECKHOST_TOKEN = os.environ.get("CHECKHOST_TOKEN", "")  # Optional, untuk rate limit lebih tinggi
REQUEST_DELAY = 2  # detik antar request (rate limit: 100/jam tanpa token)
MAX_WORKERS = 2  # parallel requests
TIMEOUT = 60  # detik timeout per request

# Check-host.net locations → IPAM region mapping
# https://check-host.net/pages/faq
LOCATION_MAP = {
    # Asia Pacific
    "sg": "oracle_sg",
    "jp": "oracle_us",  # Japan -> treat as US region
    "hk": "oracle_sg",
    "tw": "oracle_sg",
    "kr": "oracle_sg",
    "in": "oracle_sg",
    "au": "oracle_sg",
    "nz": "oracle_sg",
    
    # Americas
    "us": "oracle_us",
    "ca": "oracle_us",
    "mx": "oracle_us",
    "br": "oracle_us",
    
    # Europe
    "de": "oracle_us",  # Germany
    "nl": "oracle_us",  # Netherlands
    "uk": "oracle_us",  # UK
    "fr": "oracle_us",  # France
    "se": "oracle_us",  # Sweden
    "ru": "oracle_us",  # Russia
}

LOG_FILE = os.environ.get("LOG_FILE", "/var/log/checkhost-agent.log")


def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def api_request(url: str, headers: dict = None, method: str = "GET") -> dict:
    """Generic HTTP request."""
    if headers is None:
        headers = {}
    
    # Always set User-Agent untuk hindari 403
    if "User-Agent" not in headers:
        headers["User-Agent"] = "IPAM-Monitor/1.0 (contact: admin@sdi.net.id)"
    
    req = urllib.request.Request(url, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"API error: {e}", "ERROR")
        return {}


def ipam_request(path: str, method: str = "GET", data: dict = None) -> dict:
    """Request ke IPAM API."""
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
        log(f"IPAM API error: {e}", "ERROR")
        return {}


def get_active_ips(max_ips: int = 20) -> list[str]:
    """Ambil daftar IP aktif dari IPAM.
    Returns 1 usable host IP per CIDR allocation.
    Limit max_ips untuk hindari rate limit check-host.net.
    """
    import ipaddress

    data = ipam_request("/api/v1/ping/active-ips")

    ips = []
    if isinstance(data, dict):
        for item in data.get("items", []):
            if len(ips) >= max_ips:
                break

            prefix = item.get("ip", "")
            if not prefix:
                continue

            # Ambil usable host IP (bukan network/broadcast)
            if "/" in prefix:
                try:
                    network = ipaddress.ip_network(prefix, strict=False)
                    hosts = list(network.hosts())
                    if hosts:
                        ips.append(str(hosts[0]))
                    else:
                        # /32 atau /31 — ambil network address
                        ips.append(str(network.network_address))
                except Exception:
                    ips.append(prefix.split("/")[0])
            else:
                ips.append(prefix)

    return ips


def check_host_ping(ip: str) -> dict:
    """
    Query check-host.net API untuk ICMP ping satu IP.
    Returns: {"ip": ip, "nodes": {"sg": "online", "us": "online", ...}}
    
    API flow:
    1. GET /check-ping?host={ip}&max_nodes=20 → returns request_id + nodes
    2. Wait 3-5 seconds
    3. GET /check-result/{request_id} → returns results per node
    """
    try:
        # Step 1: Request ping check
        url = f"{CHECKHOST_API}/check-ping?host={ip}&max_nodes=20"
        headers = {"Accept": "application/json"}
        
        result = api_request(url, headers)
        
        if not result or not result.get("ok"):
            return {"ip": ip, "nodes": {}, "error": "No request_id"}
        
        request_id = result["request_id"]
        nodes_info = result.get("nodes", {})
        
        # Step 2: Wait for results
        time.sleep(3)
        
        # Step 3: Get results
        result_url = f"{CHECKHOST_API}/check-result/{request_id}"
        result = api_request(result_url, headers)
        
        if not result:
            return {"ip": ip, "nodes": {}, "error": "No result"}
        
        # Step 4: Parse results
        # Format: {"node_name": [[["OK", rtt], ["OK"], ...]}
        nodes = {}
        for node_name, check_results in result.items():
            if not check_results or not isinstance(check_results, list):
                continue
            
            # check_results is list of attempts, each attempt is [status, rtt]
            attempts = check_results[0] if check_results else []
            
            # Check if any attempt is OK
            has_ok = any(
                isinstance(attempt, list) and len(attempt) > 0 and attempt[0] == "OK"
                for attempt in attempts
            )
            
            # Get location from nodes_info
            location = nodes_info.get(node_name, ["unknown"])[0] if node_name in nodes_info else "unknown"
            
            nodes[node_name] = {
                "status": "online" if has_ok else "offline",
                "location": location
            }
        
        return {"ip": ip, "nodes": nodes}
        
    except Exception as e:
        log(f"Check-host error untuk {ip}: {e}", "ERROR")
        return {"ip": ip, "nodes": {}, "error": str(e)}


def aggregate_regions(nodes: dict) -> dict:
    """
    Aggregate check-host.net nodes ke region IPAM.
    Input: {"node_name": {"status": "online", "location": "sg"}}
    Output: {"oracle_sg": "online", "oracle_us": "offline"}
    """
    region_counts = {}
    
    for node_name, node_data in nodes.items():
        location = node_data.get("location", "unknown")
        status = node_data.get("status", "offline")
        
        # Map location code ke region
        region = LOCATION_MAP.get(location, location)
        
        if region not in region_counts:
            region_counts[region] = {"online": 0, "offline": 0}
        
        if status == "online":
            region_counts[region]["online"] += 1
        else:
            region_counts[region]["offline"] += 1
    
    # Determine final status untuk setiap region
    regions = {}
    for region, counts in region_counts.items():
        if counts["online"] > 0:
            regions[region] = "online"
        else:
            regions[region] = "offline"
    
    return regions


def send_to_ipam(ip: str, regions: dict, all_nodes: dict = None):
    """Kirim hasil ke IPAM server.
    regions: {"oracle_sg": "online", "oracle_us": "online", "sg": "online", ...}
    all_nodes: {"node_name": {"status": "online", "location": "sg"}} — raw check-host.net data
    """
    for source in ["oracle_sg", "oracle_us"]:
        status = regions.get(source, "unknown")
        if status == "unknown":
            continue

        # Build region_details: aggregate per country_code
        region_details = {}
        for node_name, info in (all_nodes or {}).items():
            if not isinstance(info, dict):
                continue
            loc = info.get("location", "")
            st = info.get("status", "unknown")
            if loc and loc not in ("oracle_sg", "oracle_us"):
                if loc not in region_details or st == "online":
                    region_details[loc] = st

        data = {
            "results": [{"ip": ip, "status": status}],
            "source": source,
            "region_details": region_details,
        }

        ipam_request("/api/v1/ping/report", method="POST", data=data)


def process_ip(ip: str) -> dict:
    """Process satu IP: ping via check-host.net → kirim ke IPAM."""
    log(f"Checking {ip} via check-host.net...")
    
    result = check_host_ping(ip)
    nodes = result.get("nodes", {})
    
    if nodes:
        regions = aggregate_regions(nodes)
        send_to_ipam(ip, regions, all_nodes=nodes)
        
        # Status summary
        online_regions = sum(1 for s in regions.values() if s == "online")
        total_regions = len(regions)
        
        return {
            "ip": ip,
            "regions": regions,
            "nodes": {k: v.get("status", "unknown") for k, v in nodes.items()},
            "locations": {k: v.get("location", "unknown") for k, v in nodes.items()},
            "online_regions": online_regions,
            "total_regions": total_regions
        }
    
    return {"ip": ip, "regions": {}, "nodes": {}, "error": result.get("error")}


def run_once(limit: int = None):
    """Jalankan sekali untuk semua IP."""
    log("Starting check-host.net agent - single run")
    
    # Ambil IP list (max 20 IPs per run untuk rate limit)
    max_ips = min(limit or 20, 20)
    ips = get_active_ips(max_ips=max_ips)
    if not ips:
        log("No active IPs found", "WARN")
        return []
    
    log(f"Checking {len(ips)} IPs via check-host.net")
    for ip in ips:
        log(f"  Target: {ip}")
    
    # Process dengan thread pool
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_ip, ip): ip for ip in ips}
        
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    results.append(result)
                    
                    # Status indicator
                    online = result.get("online_regions", 0)
                    total = result.get("total_regions", 0)
                    status_char = "✓" if online > 0 else "✗"
                    print(f"  {status_char} {result['ip']} ({online}/{total} regions online)", flush=True)
                    
                    # Delay antar request (rate limit)
                    time.sleep(REQUEST_DELAY)
                    
            except Exception as e:
                log(f"Error: {e}", "ERROR")
    
    # Summary
    online = sum(1 for r in results if r.get("online_regions", 0) > 0)
    offline = sum(1 for r in results if r.get("online_regions", 0) == 0)
    log(f"Complete: {online} online, {offline} offline out of {len(results)} IPs")
    
    return results


def export_csv(results: list[dict], filename: str = "checkhost_results.csv"):
    """Export hasil ke CSV."""
    with open(filename, "w") as f:
        f.write("IP,Online Regions,Total Regions,Oracle SG,Oracle US,All Regions\n")
        for r in results:
            ip = r.get("ip", "")
            online = r.get("online_regions", 0)
            total = r.get("total_regions", 0)
            sg = r.get("regions", {}).get("oracle_sg", "N/A")
            us = r.get("regions", {}).get("oracle_us", "N/A")
            all_regions = json.dumps(r.get("regions", {}))
            f.write(f'"{ip}",{online},{total},"{sg}","{us}","{all_regions}"\n')
    
    log(f"Exported {len(results)} results to {filename}")


def main():
    parser = argparse.ArgumentParser(description="IPAM Check-Host.net Agent")
    parser.add_argument("--once", action="store_true", help="Run once")
    parser.add_argument("--interval", type=int, default=300, help="Interval (seconds)")
    parser.add_argument("--export", type=str, help="Export to CSV file")
    parser.add_argument("--limit", type=int, help="Limit number of IPs to check")
    args = parser.parse_args()
    
    log(f"Check-Host.net Agent started - Server: {IPAM_SERVER}")
    
    if not IPAM_API_KEY:
        log("WARNING: IPAM_API_KEY not set", "WARN")
    
    if not CHECKHOST_TOKEN:
        log("WARNING: CHECKHOST_TOKEN not set (rate limit: 100 requests/hour)", "WARN")
        log("Get token at: https://check-host.net/", "INFO")
    
    if args.once:
        results = run_once(limit=args.limit)
        if args.export and results:
            export_csv(results, args.export)
    else:
        log(f"Running daemon mode - interval: {args.interval}s")
        while True:
            try:
                run_once(limit=args.limit)
            except Exception as e:
                log(f"Cycle error: {e}", "ERROR")
            
            log(f"Sleeping {args.interval}s...")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
