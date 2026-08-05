import ipaddress

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File

from core.database import get_db
from core.audit import log_audit
from core.rate_limit import limiter
from services.csv_parser import parse_ipv4_csv, parse_ipv6_csv

router = APIRouter(tags=["Import"])


@router.post("/api/v1/import/preview", summary="Preview CSV import")
@limiter.limit("10/minute")
async def preview_import(request: Request, file: UploadFile = File(...), db=Depends(get_db)):
    if not file.filename.lower().endswith((".csv", ".xls", ".xlsx", ".txt")):
        raise HTTPException(400, "Hanya file CSV yang didukung")
    content = await file.read()
    if len(content) > 10_000_000:
        raise HTTPException(413, "File terlalu besar (max 10MB)")
    text = content.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")

    # Auto detect format
    first_lines = text.split("\n")[:10]
    is_ipv6 = any("::" in line and "/" in line for line in first_lines)
    # Pass filename untuk fallback prefix extraction dari filename
    meta, allocs = parse_ipv6_csv(text, filename=file.filename) if is_ipv6 else parse_ipv4_csv(text, filename=file.filename)

    # Validasi overlap + range
    import ipaddress as ip_mod
    overlaps = []
    out_of_range = []
    block_warnings = []
    sorted_a = sorted(allocs, key=lambda a: ip_mod.ip_network(a["prefix"], strict=False))
    for i in range(len(sorted_a)):
        for j in range(i + 1, len(sorted_a)):
            n1 = ip_mod.ip_network(sorted_a[i]["prefix"], strict=False)
            n2 = ip_mod.ip_network(sorted_a[j]["prefix"], strict=False)
            if n1.overlaps(n2):
                overlaps.append({
                    "a": sorted_a[i]["prefix"],
                    "b": sorted_a[j]["prefix"],
                    "a_customer": sorted_a[i].get("customer"),
                    "b_customer": sorted_a[j].get("customer"),
                })
                break

    # Validasi range: pastikan semua allocation dalam block prefix
    if meta.get("prefix"):
        try:
            block_net = ip_mod.ip_network(meta["prefix"], strict=False)
            block_capacity = 2 ** (32 - block_net.prefixlen) if block_net.version == 4 else 2 ** (128 - block_net.prefixlen)
            for a in allocs:
                try:
                    a_net = ip_mod.ip_network(a["prefix"], strict=False)
                    if a_net.version != block_net.version:
                        out_of_range.append(f"{a['prefix']} (IPv{a_net.version} vs IPv{block_net.version})")
                    elif not (a_net.network_address >= block_net.network_address and
                              a_net.broadcast_address <= block_net.broadcast_address):
                        out_of_range.append(a["prefix"])
                except ValueError:
                    pass
            if len(allocs) > block_capacity:
                block_warnings.append(f"Jumlah allocation ({len(allocs)}) melebihi kapasitas block (max {block_capacity})")
        except ValueError:
            pass

    return {
        "meta": meta,
        "allocations": allocs,
        "total_count": len(allocs),
        "format": "ipv6" if is_ipv6 else "ipv4",
        "overlaps": overlaps,
        "has_overlaps": len(overlaps) > 0,
        "out_of_range": out_of_range,
        "has_out_of_range": len(out_of_range) > 0,
        "block_warnings": block_warnings,
        "has_block_warnings": len(block_warnings) > 0,
    }


@router.post("/api/v1/import/confirm", summary="Confirm CSV import")
@limiter.limit("5/minute")
async def confirm_import(request: Request, body: dict, db=Depends(get_db)):
    meta = body.get("meta", {})
    allocs = body.get("allocations", [])
    site_id = body.get("site_id")

    if not meta.get("prefix"):
        raise HTTPException(400, "Block prefix is required")
    if not allocs:
        raise HTTPException(400, "No allocations to import")

    # Validasi block prefix capacity
    try:
        block_net = ipaddress.ip_network(meta["prefix"], strict=False)
    except ValueError:
        raise HTTPException(400, f"Invalid block prefix: {meta['prefix']}")
    block_capacity = 2 ** (32 - block_net.prefixlen) if block_net.version == 4 else 2 ** (128 - block_net.prefixlen)

    # Validasi setiap allocation berada dalam range block + capacity check
    valid_allocs = []
    out_of_range = []
    for alloc in allocs:
        if not alloc.get("prefix"):
            continue
        try:
            alloc_net = ipaddress.ip_network(alloc["prefix"], strict=False)
        except ValueError:
            continue
        if alloc_net.version != block_net.version:
            out_of_range.append(f"{alloc['prefix']} (IPv{alloc_net.version} vs IPv{block_net.version})")
            continue
        if not (alloc_net.network_address >= block_net.network_address and
                alloc_net.broadcast_address <= block_net.broadcast_address):
            out_of_range.append(alloc["prefix"])
            continue
        valid_allocs.append(alloc)

    if out_of_range:
        raise HTTPException(400, f"{len(out_of_range)} allocation(s) di luar range block {meta['prefix']}: {', '.join(out_of_range[:10])}{'...' if len(out_of_range) > 10 else ''}")

    if len(valid_allocs) > block_capacity:
        raise HTTPException(400, f"Jumlah allocation ({len(valid_allocs)}) melebihi kapasitas block {meta['prefix']} (max {block_capacity})")

    allocs = valid_allocs
    imported = 0
    skipped = 0
    block_id = None

    async with db.transaction():
        # Create or find block
        existing = await db.fetchrow("SELECT id FROM ip_blocks WHERE prefix >>= $1::inet LIMIT 1", meta["prefix"])
        if existing:
            block_id = existing["id"]
        else:
            block = await db.fetchrow(
                "INSERT INTO ip_blocks (prefix, name, asn, router, operator, site_id, status) VALUES ($1::cidr, $2, $3, $4, $5, $6::uuid, $7) RETURNING id",
                meta["prefix"], meta.get("name") or meta["prefix"], meta.get("asn"), meta.get("router"), meta.get("operator"), site_id, "active"
            )
            block_id = block["id"]

        for alloc in allocs:
            if not alloc.get("prefix"):
                skipped += 1
                continue
            # Auto-correct prefix ke network address (fix host bits set)
            try:
                prefix = str(ipaddress.ip_network(alloc["prefix"], strict=False))
            except ValueError:
                skipped += 1
                continue
            alloc["prefix"] = prefix

            # Skip baris "available"/kosong sepenuhnya - JANGAN insert row untuk slot
            # kosong. Slot tanpa row allocation otomatis dianggap free oleh IPGrid,
            # jadi user bisa langsung klik-add dari IP map tanpa perlu delete manual
            # row "available" yang nyangkut terlebih dahulu.
            if alloc.get("status") == "available":
                skipped += 1
                continue

            # Skip if already exists
            exists = await db.fetchrow("SELECT id FROM allocations WHERE prefix = $1::cidr AND block_id = $2::uuid", prefix, block_id)
            if exists:
                skipped += 1
                continue

            # Find or create customer
            customer_id = None
            if alloc.get("customer") and alloc["customer"].strip():
                cust = await db.fetchrow("SELECT id FROM customers WHERE name ILIKE $1 LIMIT 1", alloc["customer"])
                if cust:
                    customer_id = cust["id"]
                else:
                    cust = await db.fetchrow("INSERT INTO customers (name) VALUES ($1) RETURNING id", alloc["customer"].strip())
                    customer_id = cust["id"]

            # Find or create VLAN (by vid + site_id, sesuai UNIQUE(vid, site_id) di schema)
            # agar allocation hasil import ter-link ke VLAN yang benar, bukan dibiarkan NULL.
            vlan_id = None
            vlan_vid = alloc.get("vlan")
            if vlan_vid:
                if site_id:
                    vlan = await db.fetchrow("SELECT id FROM vlans WHERE vid = $1 AND site_id = $2::uuid", vlan_vid, site_id)
                else:
                    vlan = await db.fetchrow("SELECT id FROM vlans WHERE vid = $1 AND site_id IS NULL", vlan_vid)
                if vlan:
                    vlan_id = vlan["id"]
                else:
                    vlan = await db.fetchrow(
                        "INSERT INTO vlans (vid, name, status, site_id) VALUES ($1, $2, $3, $4::uuid) RETURNING id",
                        vlan_vid, f"VLAN {vlan_vid}", "active", site_id
                    )
                    vlan_id = vlan["id"]

            await db.fetchrow(
                "INSERT INTO allocations (prefix, block_id, customer_id, vlan_id, status, description, notes) VALUES ($1::cidr, $2::uuid, $3::uuid, $4::uuid, $5::alloc_status_t, $6, $7) RETURNING id",
                alloc["prefix"], block_id, customer_id, vlan_id, alloc.get("status", "active"), alloc.get("description", ""), alloc.get("notes", "")
            )
            imported += 1

    # Log — enriched with import details
    block_row = await db.fetchrow("SELECT prefix::text, name FROM ip_blocks WHERE id=$1::uuid", block_id)
    block_prefix = block_row["prefix"] if block_row else str(meta.get("prefix",""))
    block_name = block_row["name"] if block_row else meta.get("name","")

    # Collect imported allocation summaries (prefix + customer)
    alloc_summary = []
    for a in allocs[:200]:  # limit 200 entries in log
        if not a.get("prefix"):
            continue
        alloc_summary.append({
            "prefix": a["prefix"],
            "customer": a.get("customer") or None,
            "vlan": a.get("vlan"),
            "status": a.get("status", "active"),
        })

    await log_audit(db, "import", "block", block_id, block_prefix,
        description=f"CSV import ke {block_prefix} ({block_name}): {imported} alokasi di-import, {skipped} di-skip",
        new_data={
            "imported": imported,
            "skipped": skipped,
            "block_prefix": block_prefix,
            "block_name": block_name,
            "site_id": site_id,
            "allocations": alloc_summary,
        }, changed_by="csv_import")

    return {"block_id": str(block_id), "imported": imported, "skipped": skipped}
