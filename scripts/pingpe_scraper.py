#!/usr/bin/env python3
"""
IPAM Ping.pe Scraper — Ambil hasil ping dari ping.pe untuk semua IP di IPAM

Cara pakai:
    export IPAM_SERVER="http://103.10.120.11:8101"
    export IPAM_API_KEY="your-api-key"
    python3 pingpe_scraper.py

    Atau sekali jalan:
    python3 pingpe_scraper.py --once

Output:
    - Hasil disimpan ke ping_results (kolom oracle_sg_status / oracle_us_status)
    - Bisa juga export ke CSV untuk dokumentasi
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Configuration ─────────────────────────────────────────────
IPAM_SERVER = os.environ.get("IPAM_SERVER", "http://103.10.120.11:8101")
IPAM_API_KEY = os.environ.get("IPAM_API_KEY", "")
PINGPE_API = "https://ping.pe/api"  # Backend API ping.pe
REQUEST_DELAY = 2  # detik antar request (hindari rate limit)
MAX_WORKERS = 3  # parallel requests
TIMEOUT = 30  # detik timeout per request

LOG_FILE = os.environ.get("LOG_FILE", "/var/log/pingpe-scraper.log")


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
        log(f"API error: {e}", "ERROR")
        return {}


def get_active_ips() -> list[dict]:
    """Ambil daftar IP aktif dari IPAM."""
    data = api_request("/api/v1/ping/active-ips")
    return data.get("items", [])


def pingpe_lookup(ip: str) -> dict:
    """
    Query ping.pe API untuk satu IP.
    Returns: {"ip": ip, "regions": {"sg": "online", "us": "online", ...}}
    """
    try:
        # ping.pe API endpoint - TCP ping
        url = f"https://ping.pe/ajax"
        
        # Data untuk request
        params = {
            "host": ip,
            "port": "80",  # TCP ping port 80
            "type": "tcp"
        }
        
        # Encode sebagai form data
        data = urllib.parse.urlencode(params).encode()
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (compatible; IPAM-Monitor/1.0)",
            "Referer": "https://ping.pe/",
            "Origin": "https://ping.pe"
        }
        
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            result = resp.read().decode()
            
            # Parse hasil - ping.pe returns HTML/JSON mix
            # Kita parse untuk dapat status dari setiap region
            regions = {}
            
            # Cek apakah online dari beberapa lokasi utama
            # ping.pe biasanya return status dari multiple locations
            if "Online" in result or "online" in result:
                # Simple parsing - dalam production pakai BeautifulSoup
                regions["global"] = "online"
            else:
                regions["global"] = "offline"
            
            return {
                "ip": ip,
                "regions": regions,
                "raw_result": result[:500]  # Simpan sebagian raw untuk debug
            }
            
    except Exception as e:
        log(f"Ping.pe error untuk {ip}: {e}", "ERROR")
        return {"ip": ip, "regions": {"global": "error"}, "error": str(e)}


def pingpe_lookup_v2(ip: str) -> dict:
    """
    Alternative: Menggunakan ping.pe's check endpoint.
    Returns status dari berbagai lokasi.
    """
    try:
        # Endpoint yang lebih reliable
        url = f"https://ping.pe/ajax/host/{ip}"
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; IPAM-Monitor/1.0)",
            "Accept": "application/json",
            "Referer": "https://ping.pe/"
        }
        
        req = urllib.request.Request(url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            result = json.loads(resp.read())
            
            # Parse results
            regions = {}
            if isinstance(result, dict):
                # Map lokasi ping.pe ke region names
                location_map = {
                    "SG": "oracle_sg",
                    "US": "oracle_us", 
                    "JP": "oracle_us",  # Japan -> US region
                    "DE": "oracle_us",  # Germany -> US region
                    "AU": "oracle_sg",  # Australia -> SG region
                    "ID": "icmp_local",  # Indonesia -> local
                }
                
                for loc, status in result.items():
                    region = location_map.get(loc, loc.lower())
                    regions[region] = "online" if status.get("loss") == "0" else "offline"
            
            return {"ip": ip, "regions": regions}
            
    except Exception as e:
        log(f"Ping.pe v2 error untuk {ip}: {e}", "ERROR")
        return {"ip": ip, "regions": {}, "error": str(e)}


def send_results(ip: str, regions: dict):
    """Kirim hasil ke IPAM server."""
    # Map region ke source name yang sesuai dengan IPAM
    source_map = {
        "oracle_sg": "oracle_sg",
        "oracle_us": "oracle_us",
        "icmp_local": "icmp_local",
        "global": "oracle_sg",  # default ke SG
    }
    
    for region, status in regions.items():
        source = source_map.get(region, region)
        
        # Kirim sebagai agent report
        data = {
            "results": [{"ip": ip, "status": status}],
            "source": source
        }
        api_request("/api/v1/ping/report", method="POST", data=data)


def process_ip(ip_info: dict) -> dict:
    """Process satu IP: ping via ping.pe → kirim ke IPAM."""
    ip = ip_info.get("ip")
    if not ip:
        return None
    
    log(f"Pinging {ip} via ping.pe...")
    
    # Coba v2 dulu, fallback ke v1
    result = pingpe_lookup_v2(ip)
    if not result.get("regions"):
        result = pingpe_lookup(ip)
    
    # Kirim ke IPAM
    if result.get("regions"):
        send_results(ip, result["regions"])
    
    return result


def run_once():
    """Jalankan sekali untuk semua IP."""
    log("Starting ping.pe scraper - single run")
    
    # Ambil IP list
    ips = get_active_ips()
    if not ips:
        log("No active IPs found", "WARN")
        return
    
    log(f"Found {ips.get('total', len(ips))} active IPs")
    items = ips.get("items", ips) if isinstance(ips, dict) else ips
    
    # Process dengan thread pool
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_ip, ip): ip for ip in items}
        
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    results.append(result)
                    status = "✓" if result.get("regions", {}).get("global") == "online" else "✗"
                    print(f"  {status} {result['ip']}")
            except Exception as e:
                log(f"Error: {e}", "ERROR")
    
    # Summary
    online = sum(1 for r in results if r.get("regions", {}).get("global") == "online")
    offline = sum(1 for r in results if r.get("regions", {}).get("global") == "offline")
    log(f"Complete: {online} online, {offline} offline out of {len(results)} IPs")
    
    return results


def run_daemon(interval: int = 300):
    """Jalankan sebagai daemon."""
    log(f"Starting ping.pe scraper daemon - interval: {interval}s")
    
    while True:
        try:
            run_once()
        except Exception as e:
            log(f"Cycle error: {e}", "ERROR")
        
        log(f"Sleeping {interval}s...")
        time.sleep(interval)


def export_csv(results: list[dict], filename: str = "pingpe_results.csv"):
    """Export hasil ke CSV."""
    with open(filename, "w") as f:
        f.write("IP,Status,Regions,Raw\n")
        for r in results:
            ip = r.get("ip", "")
            status = r.get("regions", {}).get("global", "unknown")
            regions = json.dumps(r.get("regions", {}))
            raw = r.get("raw_result", "")[:100]
            f.write(f'"{ip}","{status}","{regions}","{raw}"\n')
    
    log(f"Exported {len(results)} results to {filename}")


def main():
    parser = argparse.ArgumentParser(description="IPAM Ping.pe Scraper")
    parser.add_argument("--once", action="store_true", help="Run once")
    parser.add_argument("--interval", type=int, default=300, help="Interval (seconds)")
    parser.add_argument("--export", type=str, help="Export to CSV file")
    parser.add_argument("--limit", type=int, help="Limit number of IPs to check")
    args = parser.parse_args()
    
    log(f"Ping.pe Scraper started - Server: {IPAM_SERVER}")
    
    if not IPAM_API_KEY:
        log("WARNING: IPAM_API_KEY not set", "WARN")
    
    if args.once:
        results = run_once()
        if args.export and results:
            export_csv(results, args.export)
    else:
        run_daemon(args.interval)


if __name__ == "__main__":
    main()
