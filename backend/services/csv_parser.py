"""CSV Parser — extract IPv4 & IPv6 allocations from non-uniform CSV formats."""

import ipaddress, math


def to_plen(size):
    """Convert IP count to prefix length."""
    if size <= 0:
        return 30
    b = 1
    while b < size:
        b <<= 1
    return 32 - int(math.log2(b))


def parse_ipv4_csv(content: str):
    """Parse IPv4 matrix-format CSV from SDI spreadsheets."""
    lines = content.splitlines()
    meta = {"asn": None, "router": None, "operator": None, "prefix": None, "name": None}
    data_rows = []
    in_data = False

    for line in lines:
        cols = [c.strip() for c in line.split(",")]
        raw = cols[0] if cols else ""

        if raw.startswith("ASN Origin"):
            meta["asn"] = line.split(":", 1)[1].strip().split(",")[0].strip()
            continue
        elif raw.startswith("Router"):
            meta["router"] = line.split(":", 1)[1].strip().split(",")[0].strip()
            continue
        elif raw.startswith("IP Name"):
            meta["operator"] = line.split(":", 1)[1].strip().split(",")[0].strip()
            continue

        if "|" in raw and not meta["prefix"]:
            parts = raw.split("|")
            try:
                net = ipaddress.ip_network(parts[0].strip(), strict=False)
                if net.prefixlen <= 24:
                    meta["prefix"] = str(net)
                    meta["name"] = str(net)
                    if len(parts) > 1 and parts[1].strip().isdigit():
                        meta["asn"] = parts[1].strip()
                continue
            except ValueError:
                pass
        try:
            net = ipaddress.ip_network(raw, strict=False)
            if net.prefixlen <= 24 and not meta["prefix"]:
                meta["prefix"] = str(net)
                meta["name"] = str(net)
            continue
        except ValueError:
            pass

        if raw == "Alokasi":
            in_data = True
            continue
        if not in_data:
            continue
        if len(cols) < 4:
            continue
        if cols[2] in ("Network", "/30", "/29", "/28", "") or not cols[2].isdigit():
            continue
        if not cols[3].isdigit():
            continue

        data_rows.append({
            "name": cols[0],
            "vlan": cols[1],
            "net": int(cols[2]),
            "bcast": int(cols[3]),
            "extra": cols[4:16],
            "notes": cols[17].strip() if len(cols) > 17 else "",
        })

    if not meta.get("prefix"):
        return meta, []

    base_ip = str(ipaddress.ip_network(meta["prefix"], strict=False).network_address).rsplit(".", 1)[0]

    groups = []
    cur = None
    for r in data_rows:
        if r["name"] or r["vlan"]:
            if cur:
                groups.append(cur)
            cur = {"name": r["name"] or None, "vlan": r["vlan"], "notes": r["notes"], "rows": [r]}
        else:
            if cur:
                cur["rows"].append(r)
            else:
                cur = {"name": None, "vlan": "", "notes": r["notes"], "rows": [r]}
                groups.append(cur)
                cur = None
    if cur:
        groups.append(cur)

    allocations = []
    for g in groups:
        min_net = min(r["net"] for r in g["rows"])
        max_bcast = max(r["bcast"] for r in g["rows"])
        size = max_bcast - min_net + 1
        plen = to_plen(size)
        prefix = f"{base_ip}.{min_net}/{plen}"

        try:
            ipaddress.ip_network(prefix, strict=False)
        except ValueError:
            continue

        vlan = None
        vr = g["vlan"].strip()
        if vr.isdigit():
            vlan = int(vr)
        elif " " in vr:
            for p in vr.split():
                if p.isdigit():
                    vlan = int(p)
                    break

        customer = g["name"]
        allocations.append({
            "prefix": prefix,
            "customer": customer,
            "vlan": vlan,
            "notes": g["notes"],
            "plen": plen,
            "status": "active" if customer else "available",
            "description": customer or "",
        })

    return meta, allocations


def parse_ipv6_csv(content: str):
    """Parse IPv6 list-format CSV from SDI spreadsheets."""
    lines = content.splitlines()
    meta = {"asn": None, "router": None, "operator": None, "prefix": None, "name": None}
    allocations = []

    for line in lines:
        cols = [c.strip() for c in line.split(",")]
        if len(cols) < 2:
            continue
        col1 = cols[1].strip()
        if not col1:
            continue

        if meta["prefix"] is None:
            parts = col1.split(None, 1)
            col1_addr = parts[0].split("(")[0].strip()
            try:
                net = ipaddress.ip_network(col1_addr, strict=False)
                if net.version == 6 and net.prefixlen <= 48:
                    meta["prefix"] = str(net)
                    if " - " in col1:
                        meta["name"] = col1.split(" - ", 1)[1].strip()
                    elif len(parts) > 1:
                        meta["name"] = parts[1].strip(" -")
                    continue
            except ValueError:
                pass
            continue

        col1_clean = col1.split("(")[0].strip()
        side = None
        if "(" in col1 and ")" in col1:
            side = col1[col1.index("(") + 1:col1.index(")")]

        try:
            iface = ipaddress.ip_interface(col1_clean)
        except ValueError:
            continue

        if iface.version != 6:
            continue

        prefix = f"{iface.ip}/{iface.network.prefixlen}"
        customer = cols[2].strip() if len(cols) > 2 and cols[2].strip() else None
        status = "active" if customer else "available"
        desc = customer or ""
        if side:
            desc = f"{customer} [{side}]" if customer else f"[{side}]"

        allocations.append({
            "prefix": prefix,
            "customer": customer,
            "vlan": None,
            "description": desc,
            "notes": side or "",
            "status": status,
        })

    return meta, allocations
