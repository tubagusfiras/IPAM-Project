#!/usr/bin/env python3
"""
IPAM CLI Import Tool
Usage:
  python3 import_csv.py --file /path/to/file.csv [--site-id UUID] [--dry-run]
"""
import argparse, ipaddress, json, math, os, sys
import urllib.request, urllib.error

API = os.getenv("IPAM_API", "http://localhost:8101/api/v1")

def api_post(path, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(f"{API}{path}", data=body,
           headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def api_get(path):
    with urllib.request.urlopen(f"{API}{path}") as r:
        return json.loads(r.read())

# ── PARSER HELPERS ────────────────────────────────────────────
def to_plen(size):
    if size <= 0: return 30
    b = 1
    while b < size: b <<= 1
    import math
    return 32 - int(math.log2(b))


def parse_ipv4(content):
    meta  = {"asn":None,"router":None,"operator":None,"prefix":None,"name":None}
    data_rows = []
    in_data = False

    for line in content.splitlines():
        cols = [c.strip() for c in line.split(",")]
        raw  = cols[0] if cols else ""
        if raw.startswith("ASN Origin"):
            meta["asn"] = line.split(":",1)[1].strip().split(",")[0].strip(); continue
        elif raw.startswith("Router"):
            meta["router"] = line.split(":",1)[1].strip().split(",")[0].strip(); continue
        elif raw.startswith("IP Name"):
            meta["operator"] = line.split(":",1)[1].strip().split(",")[0].strip(); continue
        try:
            import ipaddress
            net = ipaddress.ip_network(raw, strict=False)
            if net.prefixlen <= 24 and not meta["prefix"]:
                meta["prefix"] = str(net); meta["name"] = str(net)
            continue
        except ValueError: pass
        if raw == "Alokasi": in_data = True; continue
        if not in_data: continue
        if len(cols) < 4: continue
        if cols[2] in ("Network","/30","/29","/28","") or not cols[2].isdigit(): continue
        if not cols[3].isdigit(): continue
        data_rows.append({
            "name":  cols[0],
            "vlan":  cols[1],
            "net":   int(cols[2]),
            "bcast": int(cols[3]),
            "extra": cols[4:16],
            "notes": cols[17].strip() if len(cols) > 17 else "",
        })

    if not meta.get("prefix"):
        return meta, []

    import ipaddress
    base_ip = str(ipaddress.ip_network(meta["prefix"],strict=False).network_address).rsplit(".",1)[0]

    # Group: empty name AND empty vlan = continuation
    groups = []
    cur = None
    for r in data_rows:
        if r["name"] or r["vlan"]:
            if cur: groups.append(cur)
            cur = {"name":r["name"] or None,"vlan":r["vlan"],"notes":r["notes"],"rows":[r]}
        else:
            if cur: cur["rows"].append(r)
            else:
                cur = {"name":None,"vlan":"","notes":r["notes"],"rows":[r]}
                groups.append(cur); cur = None
    if cur: groups.append(cur)

    allocs = []
    for g in groups:
        min_net   = min(r["net"]   for r in g["rows"])
        max_bcast = max(r["bcast"] for r in g["rows"])
        size      = max_bcast - min_net + 1
        plen      = to_plen(size)
        prefix    = f"{base_ip}.{min_net}/{plen}"
        try: ipaddress.ip_network(prefix, strict=False)
        except ValueError: continue
        vlan = None
        vr   = g["vlan"].strip()
        if vr.isdigit(): vlan = int(vr)
        elif " " in vr:
            for p in vr.split():
                if p.isdigit(): vlan=int(p); break
        customer = g["name"]
        allocs.append({"prefix":prefix,"customer":customer,"vlan":vlan,
                        "description":customer or "","notes":g["notes"],
                        "status":"active" if customer else "available"})
    return meta, allocs

def parse_ipv6(content):
    meta   = {"asn":None,"router":None,"operator":None,"prefix":None,"name":None}
    allocs = []
    for line in content.splitlines():
        cols = [c.strip() for c in line.split(",")]
        if len(cols) < 2: continue
        col1 = cols[1].strip()
        if not col1: continue
        if not meta["prefix"]:
            parts    = col1.split(None,1)
            col1addr = parts[0].split("(")[0].strip()
            try:
                net = ipaddress.ip_network(col1addr, strict=False)
                if net.version==6 and net.prefixlen<=48:
                    meta["prefix"] = str(net)
                    meta["name"]   = col1.split(" - ",1)[1].strip() if " - " in col1 else col1addr
                    continue
            except ValueError: pass
            continue
        col1c = col1.split("(")[0].strip()
        side  = col1[col1.index("(")+1:col1.index(")")] if "(" in col1 and ")" in col1 else None
        try: iface = ipaddress.ip_interface(col1c)
        except ValueError: continue
        if iface.version != 6: continue
        prefix   = f"{iface.ip}/{iface.network.prefixlen}"
        customer = cols[2].strip() if len(cols)>2 and cols[2].strip() else None
        desc     = f"{customer} [{side}]" if (customer and side) else (f"[{side}]" if side else customer or "")
        allocs.append({"prefix":prefix,"customer":customer,"vlan":None,
                        "description":desc,"notes":side or "",
                        "status":"active" if customer else "available"})
    return meta, allocs

# ── MAIN ─────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="IPAM CLI Import Tool")
    p.add_argument("--file",    required=True, help="Path to CSV file")
    p.add_argument("--site-id", default=None,  help="Site UUID to assign block to")
    p.add_argument("--dry-run", action="store_true", help="Preview only, do not import")
    p.add_argument("--api",     default=None,  help="API base URL (default: http://localhost:8101/api/v1)")
    args = p.parse_args()

    global API
    if args.api: API = args.api

    filepath = args.file
    if not os.path.isfile(filepath):
        print(f"❌ File not found: {filepath}"); sys.exit(1)

    content  = open(filepath, encoding="utf-8-sig").read()
    filename = os.path.basename(filepath).lower()

    # detect IPv6
    is_ipv6 = "ipv6" in filename or "v6" in filename or "::" in content[:500]
    print(f"📄 File    : {os.path.basename(filepath)}")
    print(f"🔍 Detected: {'IPv6' if is_ipv6 else 'IPv4'}")

    meta, allocs = parse_ipv6(content) if is_ipv6 else parse_ipv4(content)

    print(f"\n📋 Block Metadata:")
    for k,v in meta.items():
        print(f"   {k:12}: {v}")

    print(f"\n📊 Allocations: {len(allocs)} total")
    active    = sum(1 for a in allocs if a["status"]=="active")
    available = sum(1 for a in allocs if a["status"]=="available")
    print(f"   Active   : {active}")
    print(f"   Available: {available}")

    print(f"\n{'─'*60}")
    print(f"  {'#':<4} {'Prefix':<26} {'VLAN':<7} {'Customer':<35} Status")
    print(f"{'─'*60}")
    for i,a in enumerate(allocs,1):
        print(f"  {i:<4} {a['prefix']:<26} {str(a['vlan'] or '—'):<7} {str(a['customer'] or '— available —'):<35} {a['status']}")

    if args.dry_run:
        print(f"\n⚠️  Dry run — nothing imported."); return

    if not meta.get("prefix"):
        print(f"\n❌ No valid parent prefix detected."); sys.exit(1)

    print(f"\n⏳ Importing to API...")
    try:
        result = api_post("/import/confirm", {
            "meta": meta,
            "allocations": allocs,
            "site_id": args.site_id,
        })
        print(f"\n✅ Import successful!")
        print(f"   Block ID : {result['block_id']}")
        print(f"   Imported : {result['imported']}")
        print(f"   Skipped  : {result['skipped']}")
    except urllib.error.HTTPError as e:
        print(f"\n❌ API Error {e.code}: {e.read().decode()}"); sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}"); sys.exit(1)

if __name__ == "__main__":
    main()
