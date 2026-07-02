"""CSV Parser — extract IPv4 & IPv6 allocations from non-uniform CSV formats."""

import ipaddress, math, re


def to_plen(size):
    """Convert IP count to prefix length."""
    if size <= 0:
        return 30
    b = 1
    while b < size:
        b <<= 1
    return 32 - int(math.log2(b))


def extract_prefix_from_filename(filename: str) -> str | None:
    """Extract IP prefix from filename as fallback."""
    if not filename:
        return None

    # Pattern 1: 114.198.242.0_24 atau 114.198.242.0-24
    pattern1 = r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[_\-](\d{1,2})'
    match = re.search(pattern1, filename)
    if match:
        ip, mask = match.groups()
        try:
            net = ipaddress.ip_network(f"{ip}/{mask}", strict=False)
            return str(net)
        except ValueError:
            pass

    # Pattern 2: 114.198.242.0/24
    pattern2 = r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2})'
    match = re.search(pattern2, filename)
    if match:
        try:
            net = ipaddress.ip_network(match.group(1), strict=False)
            return str(net)
        except ValueError:
            pass

    # Pattern 3: hanya IP tanpa mask, assume /24
    pattern3 = r'(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}'
    match = re.search(pattern3, filename)
    if match:
        try:
            # Extract 3 octets, assume /24
            base = match.group(1)
            net = ipaddress.ip_network(f"{base}.0/24", strict=False)
            return str(net)
        except ValueError:
            pass

    return None


def parse_ipv4_csv(content: str, filename: str = None):
    """Parse IPv4 matrix-format CSV from SDI spreadsheets."""
    lines = content.splitlines()
    meta = {"asn": None, "router": None, "operator": None, "prefix": None, "name": None}
    data_rows = []
    in_data = False

    # Phase 1: Scan ALL lines untuk metadata (bukan hanya awal)
    for line_idx, line in enumerate(lines[:30]):  # scan first 30 lines
        cols = [c.strip() for c in line.split(",")]
        raw = cols[0] if cols else ""

        # Scan semua kolom untuk metadata
        for ci, c in enumerate(cols):
            c_lower = c.lower()

            # ASN extraction
            if "asn origin" in c_lower or "asn" in c_lower:
                if ":" in c:
                    after = c.split(":", 1)[1].strip()
                    asn_match = re.search(r'\b(\d{4,6})\b', after)
                    if asn_match and not meta["asn"]:
                        meta["asn"] = asn_match.group(1)

            # Router extraction
            if c_lower.startswith("router") and ":" in c:
                parts = c.split(":", 1)
                if len(parts) > 1 and not meta["router"]:
                    meta["router"] = parts[1].strip()

            # Operator extraction
            if c_lower.startswith("ip name") and ":" in c:
                parts = c.split(":", 1)
                if len(parts) > 1 and not meta["operator"]:
                    meta["operator"] = parts[1].strip()

            # Prefix extraction dari "IP Blok", "IP Block", dll
            if not meta["prefix"] and ("blok" in c_lower or "prefix" in c_lower):
                # Extract semua IP/CIDR pattern dari string ini
                pattern = r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}\b'
                matches = re.findall(pattern, c)
                for match in matches:
                    try:
                        net = ipaddress.ip_network(match, strict=False)
                        if net.prefixlen <= 30:  # valid subnet size
                            meta["prefix"] = str(net)
                            meta["name"] = str(net)
                            break
                    except ValueError:
                        continue

        # Format: "103.226.118.0/24 | 56246"
        if "|" in raw and not meta["prefix"]:
            parts = raw.split("|")
            try:
                net = ipaddress.ip_network(parts[0].strip(), strict=False)
                if net.prefixlen <= 30:
                    meta["prefix"] = str(net)
                    meta["name"] = str(net)
                    if len(parts) > 1 and parts[1].strip().isdigit():
                        meta["asn"] = parts[1].strip()
                continue
            except ValueError:
                pass

        # Format: standalone prefix line (baris sendiri)
        try:
            net = ipaddress.ip_network(raw, strict=False)
            if net.prefixlen <= 30 and not meta["prefix"]:
                meta["prefix"] = str(net)
                meta["name"] = str(net)
            continue
        except ValueError:
            pass

    # Fallback: extract prefix dari filename jika tidak ditemukan di content
    if not meta["prefix"] and filename:
        extracted = extract_prefix_from_filename(filename)
        if extracted:
            meta["prefix"] = extracted
            meta["name"] = extracted

    # Phase 2: Parse data rows
    for line in lines:
        cols = [c.strip() for c in line.split(",")]
        raw = cols[0] if cols else ""

        # Deteksi header "Alokasi"
        if raw == "Alokasi" or any(c == "Alokasi" for c in cols[:5]):
            in_data = True
            continue

        if not in_data:
            continue

        if len(cols) < 4:
            continue

        # Auto-detect column layout
        # Cari kolom pertama yang berisi angka 0-255 (network octet terakhir)
        first_digit_idx = -1
        for ci in range(min(10, len(cols))):
            if cols[ci].isdigit() and 0 <= int(cols[ci]) <= 255:
                first_digit_idx = ci
                break

        # Cari kolom name (non-digit, non-empty, bukan header keyword)
        name_idx = -1
        for ci in range(min(5, len(cols))):
            v = cols[ci]
            if v and not v.isdigit() and not v.startswith(("/", "Mask", "Network", "Broadcast", "Alokasi")) and "/" not in v:
                name_idx = ci
                break

        # Determine column mapping
        if name_idx >= 0 and first_digit_idx > name_idx:
            name_col = name_idx
            vlan_col = name_idx + 1
            net_col = first_digit_idx if first_digit_idx <= name_idx + 3 else name_idx + 2
            bcast_col = net_col + 1
        else:
            # Default mapping
            name_col, vlan_col, net_col, bcast_col = 0, 1, 2, 3

        # Validate this is a data row
        if net_col >= len(cols) or bcast_col >= len(cols):
            continue

        if cols[net_col] in ("Network", "/30", "/29", "/28", "") or not cols[net_col].isdigit():
            continue

        if not cols[bcast_col].isdigit():
            continue

        if name_col < len(cols) and cols[name_col].startswith('/'):
            continue

        # Extract data
        data_rows.append({
            "name": cols[name_col] if name_col < len(cols) else "",
            "vlan": cols[vlan_col] if vlan_col < len(cols) else "",
            "net": int(cols[net_col]),
            "bcast": int(cols[bcast_col]),
            "extra": cols[4:16] if len(cols) > 4 else [],
            "notes": cols[17].strip() if len(cols) > 17 else "",
        })

    if not meta.get("prefix"):
        return meta, []

    # Build base IP
    base_net = ipaddress.ip_network(meta["prefix"], strict=False)
    base_ip = str(base_net.network_address).rsplit(".", 1)[0]

    # Build allocations
    last_name = None
    last_vlan = None
    raw_allocs = []

    for r in data_rows:
        name = r["name"] or last_name
        vlan = r["vlan"] or last_vlan

        if r["name"] or r["vlan"]:
            last_name = r["name"]
            last_vlan = r["vlan"]

        size = r["bcast"] - r["net"] + 1
        plen = to_plen(size)

        try:
            net = ipaddress.ip_network(f"{base_ip}.{r['net']}/{plen}", strict=False)
            prefix = str(net)
        except ValueError:
            continue

        raw_allocs.append({
            "prefix": prefix,
            "customer": name,
            "vlan": int(vlan) if vlan and str(vlan).isdigit() else None,
            "notes": r.get("notes", ""),
            "status": "active" if name else "available",
            "description": name or "",
        })

    # Dedup: untuk setiap network address, ambil prefix terkecil (paling spesifik)
    seen = {}
    for a in raw_allocs:
        try:
            net = ipaddress.ip_network(a["prefix"], strict=False)
            key = str(net.network_address)

            if key not in seen:
                seen[key] = a
            else:
                # Ambil yang prefix-length lebih besar (lebih spesifik)
                existing = ipaddress.ip_network(seen[key]["prefix"], strict=False)
                if net.prefixlen > existing.prefixlen:
                    seen[key] = a
        except ValueError:
            continue

    allocations = list(seen.values())

    # Sort by IP
    allocations.sort(key=lambda a: ipaddress.ip_network(a["prefix"], strict=False))

    return meta, allocations


def parse_ipv6_csv(content: str, filename: str = None):
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
