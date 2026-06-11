from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime
import os, json, math, ipaddress

import asyncpg
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ipam:ipam@db:5432/ipam")
pool: asyncpg.Pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    yield
    await pool.close()

app = FastAPI(title="IPAM API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

async def get_db():
    async with pool.acquire() as conn:
        yield conn

def log_action(conn, table, record_id, action, old=None, new=None):
    return conn.execute(
        "INSERT INTO audit_log (table_name, record_id, action, old_data, new_data) VALUES ($1,$2,$3,$4,$5)",
        table, record_id, action,
        json.dumps(old) if old else None,
        json.dumps(new) if new else None
    )

# ------------------------------------------------------------------
# HEALTH & DASHBOARD
# ------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/v1/dashboard/stats")
async def dashboard_stats(db=Depends(get_db)):
    stats = {}
    stats["total_blocks"]      = await db.fetchval("SELECT COUNT(*) FROM ip_blocks")
    stats["total_allocations"] = await db.fetchval("SELECT COUNT(*) FROM allocations")
    stats["total_customers"]   = await db.fetchval("SELECT COUNT(*) FROM customers WHERE is_active")
    stats["total_vlans"]       = await db.fetchval("SELECT COUNT(*) FROM vlans")
    stats["total_sites"]       = await db.fetchval("SELECT COUNT(*) FROM sites")
    stats["ipv4_blocks"]       = await db.fetchval("SELECT COUNT(*) FROM ip_blocks WHERE ip_version='IPv4'")
    stats["ipv6_blocks"]       = await db.fetchval("SELECT COUNT(*) FROM ip_blocks WHERE ip_version='IPv6'")
    stats["alloc_by_status"]   = dict(await db.fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE status='active')    AS active,
            COUNT(*) FILTER (WHERE status='available') AS available,
            COUNT(*) FILTER (WHERE status='reserved')  AS reserved,
            COUNT(*) FILTER (WHERE status='deprecated') AS deprecated
        FROM allocations
    """))
    stats["recent_blocks"] = [dict(r) for r in await db.fetch("""
        SELECT
            b.prefix::text, b.name, b.ip_version, s.name AS site_name,
            COUNT(a.id) AS total_allocations,
            COUNT(a.id) FILTER (WHERE a.status = 'active') AS active_allocations,
            CASE WHEN family(b.prefix) = 4 THEN
                COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix
                    AND NOT EXISTS (
                        SELECT 1 FROM allocations a2
                        WHERE a2.block_id = b.id AND a2.id != a.id
                        AND a2.prefix::cidr >> a.prefix::cidr
                        AND a2.status != 'available'
                    )
                    THEN (2::bigint ^ (32 - masklen(a.prefix::cidr))) ELSE 0 END), 0)
            ELSE
                COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix
                    AND NOT EXISTS (
                        SELECT 1 FROM allocations a2
                        WHERE a2.block_id = b.id AND a2.id != a.id
                        AND a2.prefix::cidr >> a.prefix::cidr
                        AND a2.status != 'available'
                    )
                    THEN (2::numeric ^ (128 - masklen(a.prefix::cidr))) ELSE 0 END), 0)
            END AS used_ips,
            CASE WHEN family(b.prefix) = 4 THEN
                (2::bigint ^ (32 - masklen(b.prefix)))::numeric
            ELSE
                (2::numeric ^ (128 - masklen(b.prefix)))
            END AS total_ips
        FROM ip_blocks b
        LEFT JOIN sites s ON b.site_id = s.id
        LEFT JOIN allocations a ON a.block_id = b.id
        GROUP BY b.id, b.prefix, b.name, b.ip_version, s.name
        ORDER BY b.prefix::inet
        LIMIT 10
    """)]
    return stats

# ------------------------------------------------------------------
# SITES
# ------------------------------------------------------------------
class SiteIn(BaseModel):
    name: str
    city: Optional[str] = None
    region: Optional[str] = None
    description: Optional[str] = None

@app.get("/api/v1/sites")
async def list_sites(search: Optional[str]=Query(None), db=Depends(get_db)):
    q = f"%{search}%" if search else "%"
    rows = await db.fetch("SELECT * FROM sites WHERE name ILIKE $1 OR city ILIKE $1 ORDER BY name", q)
    return [dict(r) for r in rows]

@app.post("/api/v1/sites", status_code=201)
async def create_site(body: SiteIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO sites (name,city,region,description) VALUES ($1,$2,$3,$4) RETURNING *",
        body.name, body.city, body.region, body.description
    )
    return dict(row)

@app.put("/api/v1/sites/{site_id}")
async def update_site(site_id: str, body: SiteIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE sites SET name=$1,city=$2,region=$3,description=$4 WHERE id=$5::uuid RETURNING *",
        body.name, body.city, body.region, body.description, site_id
    )
    if not row: raise HTTPException(404, "Site not found")
    return dict(row)

@app.delete("/api/v1/sites/{site_id}", status_code=204)
async def delete_site(site_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM sites WHERE id=$1::uuid", site_id)

# ------------------------------------------------------------------
# CUSTOMERS
# ------------------------------------------------------------------
class CustomerIn(BaseModel):
    name: str
    code: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True

@app.get("/api/v1/customers")
async def list_customers(
    search: Optional[str]=Query(None),
    limit: int=Query(50,ge=1,le=500),
    offset: int=Query(0,ge=0),
    db=Depends(get_db)
):
    q = f"%{search}%" if search else "%"
    rows = await db.fetch("""
        SELECT c.*, COUNT(DISTINCT a.id) AS alloc_count
        FROM customers c
        LEFT JOIN allocations a ON a.customer_id = c.id
        WHERE c.name ILIKE $1 OR c.code ILIKE $1
        GROUP BY c.id ORDER BY c.name
        LIMIT $2 OFFSET $3
    """, q, limit, offset)
    total = await db.fetchval("SELECT COUNT(*) FROM customers WHERE name ILIKE $1 OR code ILIKE $1", q)
    return {"total": total, "items": [dict(r) for r in rows]}

@app.get("/api/v1/customers/{customer_id}")
async def get_customer(customer_id: str, db=Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM customers WHERE id=$1::uuid", customer_id)
    if not row: raise HTTPException(404, "Customer not found")
    allocs = await db.fetch("SELECT * FROM v_allocation_detail WHERE customer_id=$1::uuid ORDER BY prefix::inet", customer_id)
    return {**dict(row), "allocations": [dict(a) for a in allocs]}

@app.post("/api/v1/customers", status_code=201)
async def create_customer(body: CustomerIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO customers (name,code,contact_name,contact_email,contact_phone,description,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        body.name, body.code, body.contact_name, body.contact_email, body.contact_phone, body.description, body.is_active
    )
    return dict(row)

@app.put("/api/v1/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE customers SET name=$1,code=$2,contact_name=$3,contact_email=$4,contact_phone=$5,description=$6,is_active=$7 WHERE id=$8::uuid RETURNING *",
        body.name, body.code, body.contact_name, body.contact_email, body.contact_phone, body.description, body.is_active, customer_id
    )
    if not row: raise HTTPException(404, "Customer not found")
    return dict(row)

@app.delete("/api/v1/customers/{customer_id}", status_code=204)
async def delete_customer(customer_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM customers WHERE id=$1::uuid", customer_id)

# ------------------------------------------------------------------
# VLANs
# ------------------------------------------------------------------
class VlanIn(BaseModel):
    vid: int
    name: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None

@app.get("/api/v1/vlans")
async def list_vlans(
    search: Optional[str]=Query(None),
    site_id: Optional[str]=Query(None),
    limit: int=Query(50,ge=1,le=500),
    offset: int=Query(0,ge=0),
    db=Depends(get_db)
):
    conditions, params = ["1=1"], []
    if search:
        params.append(f"%{search}%")
        conditions.append(f"(v.name ILIKE ${len(params)} OR v.vid::text ILIKE ${len(params)})")
    if site_id:
        params.append(site_id)
        conditions.append(f"v.site_id = ${len(params)}::uuid")
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(f"""
        SELECT v.*, s.name AS site_name
        FROM vlans v LEFT JOIN sites s ON v.site_id=s.id
        WHERE {where} ORDER BY v.vid
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """, *params)
    total = await db.fetchval(f"SELECT COUNT(*) FROM vlans v WHERE {where}", *params[:-2])
    return {"total": total, "items": [dict(r) for r in rows]}

@app.post("/api/v1/vlans", status_code=201)
async def create_vlan(body: VlanIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO vlans (vid,name,site_id,status,description) VALUES ($1,$2,$3::uuid,$4::vlan_status_t,$5) RETURNING *",
        body.vid, body.name, body.site_id, body.status, body.description
    )
    return dict(row)

@app.put("/api/v1/vlans/{vlan_id}")
async def update_vlan(vlan_id: str, body: VlanIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE vlans SET vid=$1,name=$2,site_id=$3::uuid,status=$4::vlan_status_t,description=$5 WHERE id=$6::uuid RETURNING *",
        body.vid, body.name, body.site_id, body.status, body.description, vlan_id
    )
    if not row: raise HTTPException(404, "VLAN not found")
    return dict(row)

@app.delete("/api/v1/vlans/{vlan_id}", status_code=204)
async def delete_vlan(vlan_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM vlans WHERE id=$1::uuid", vlan_id)

# ------------------------------------------------------------------
# IP BLOCKS
# ------------------------------------------------------------------
class BlockIn(BaseModel):
    prefix: str
    name: Optional[str] = None
    asn: Optional[str] = None
    router: Optional[str] = None
    operator: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None

@app.get("/api/v1/blocks")
async def list_blocks(
    search: Optional[str]=Query(None),
    ip_version: Optional[str]=Query(None),
    site_id: Optional[str]=Query(None),
    limit: int=Query(50,ge=1,le=500),
    offset: int=Query(0,ge=0),
    db=Depends(get_db)
):
    conditions, params = ["1=1"], []
    if search:
        params.append(f"%{search}%")
        conditions.append(f"(b.prefix::text ILIKE ${len(params)} OR b.name ILIKE ${len(params)} OR b.asn ILIKE ${len(params)} OR b.router ILIKE ${len(params)})")
    if ip_version:
        params.append(ip_version)
        conditions.append(f"b.ip_version = ${len(params)}::ip_version_t")
    if site_id:
        params.append(site_id)
        conditions.append(f"b.site_id = ${len(params)}::uuid")
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(f"""
        SELECT b.prefix::text, b.ip_version, b.name, b.asn, b.router, b.operator,
               b.status, b.description, b.id, b.site_id, b.created_at,
               s.name AS site_name,
               COUNT(a.id) AS total_allocations,
               COUNT(a.id) FILTER (WHERE a.status='active') AS active_allocations,
               CASE WHEN family(b.prefix) = 4 THEN
                   COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix
                       AND NOT EXISTS (
                           SELECT 1 FROM allocations a2
                           WHERE a2.block_id = b.id AND a2.id != a.id
                           AND a2.prefix::cidr >> a.prefix::cidr
                           AND a2.status != 'available'
                       )
                       THEN (2::bigint ^ (32 - masklen(a.prefix::cidr))) ELSE 0 END), 0)::numeric
               ELSE
                   COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix
                       AND NOT EXISTS (
                           SELECT 1 FROM allocations a2
                           WHERE a2.block_id = b.id AND a2.id != a.id
                           AND a2.prefix::cidr >> a.prefix::cidr
                           AND a2.status != 'available'
                       )
                       THEN (2::numeric ^ (128 - masklen(a.prefix::cidr))) ELSE 0 END), 0)
               END AS used_ips,
               CASE WHEN family(b.prefix) = 4 THEN
                   (2::bigint ^ (32 - masklen(b.prefix)))::numeric
               ELSE
                   (2::numeric ^ (128 - masklen(b.prefix)))
               END AS total_ips
        FROM ip_blocks b
        LEFT JOIN sites s ON b.site_id=s.id
        LEFT JOIN allocations a ON a.block_id=b.id
        WHERE {where}
        GROUP BY b.id, s.name
        ORDER BY b.prefix::inet
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """, *params)
    total = await db.fetchval(f"SELECT COUNT(*) FROM ip_blocks b WHERE {where}", *params[:-2])
    return {"total": total, "items": [dict(r) for r in rows]}

@app.get("/api/v1/blocks/{block_id}")
async def get_block(block_id: str, db=Depends(get_db)):
    row = await db.fetchrow("""
        SELECT b.*, s.name AS site_name,
               CASE WHEN family(b.prefix) = 4 THEN
                   COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix
                       AND NOT EXISTS (
                           SELECT 1 FROM allocations a2
                           WHERE a2.block_id = b.id AND a2.id != a.id
                           AND a2.prefix::cidr >> a.prefix::cidr
                           AND a2.status != 'available'
                       )
                       THEN (2::bigint ^ (32 - masklen(a.prefix::cidr))) ELSE 0 END), 0)::numeric
               ELSE
                   COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix
                       AND NOT EXISTS (
                           SELECT 1 FROM allocations a2
                           WHERE a2.block_id = b.id AND a2.id != a.id
                           AND a2.prefix::cidr >> a.prefix::cidr
                           AND a2.status != 'available'
                       )
                       THEN (2::numeric ^ (128 - masklen(a.prefix::cidr))) ELSE 0 END), 0)
               END AS used_ips,
               CASE WHEN family(b.prefix) = 4 THEN
                   (2::bigint ^ (32 - masklen(b.prefix)))::numeric
               ELSE
                   (2::numeric ^ (128 - masklen(b.prefix)))
               END AS total_ips
        FROM ip_blocks b
        LEFT JOIN sites s ON b.site_id=s.id
        LEFT JOIN allocations a ON a.block_id=b.id
        WHERE b.id=$1::uuid
        GROUP BY b.id, s.name
    """, block_id)
    if not row: raise HTTPException(404, "Block not found")
    allocs = await db.fetch("""
        SELECT a.id, a.prefix::text, a.ip_version, a.status, a.owner_type, a.description, a.notes,
               a.created_at, a.updated_at, a.block_id,
               b.prefix::text AS block_prefix, b.name AS block_name, b.asn AS block_asn,
               s.name AS site_name,
               a.customer_id, c.name AS customer_name, c.code AS customer_code,
               a.vlan_id, v.vid AS vlan_vid, v.name AS vlan_name
        FROM allocations a
        JOIN ip_blocks b ON a.block_id = b.id
        LEFT JOIN sites s ON b.site_id = s.id
        LEFT JOIN customers c ON a.customer_id = c.id
        LEFT JOIN vlans v ON a.vlan_id = v.id
        WHERE a.block_id = $1::uuid
        ORDER BY a.prefix::inet
    """, block_id)
    return {**dict(row), "prefix": str(row["prefix"]), "allocations": [dict(a) for a in allocs]}

@app.post("/api/v1/blocks", status_code=201)
async def create_block(body: BlockIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO ip_blocks (prefix,name,asn,router,operator,site_id,status,description) VALUES ($1::cidr,$2,$3,$4,$5,$6::uuid,$7::block_status_t,$8) RETURNING *",
        body.prefix, body.name, body.asn, body.router, body.operator, body.site_id, body.status, body.description
    )
    return {**dict(row), "prefix": str(row["prefix"])}

@app.put("/api/v1/blocks/{block_id}")
async def update_block(block_id: str, body: BlockIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE ip_blocks SET prefix=$1::cidr,name=$2,asn=$3,router=$4,operator=$5,site_id=$6::uuid,status=$7::block_status_t,description=$8 WHERE id=$9::uuid RETURNING *",
        body.prefix, body.name, body.asn, body.router, body.operator, body.site_id, body.status, body.description, block_id
    )
    if not row: raise HTTPException(404, "Block not found")
    return {**dict(row), "prefix": str(row["prefix"])}

@app.delete("/api/v1/blocks/{block_id}", status_code=204)
async def delete_block(block_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM ip_blocks WHERE id=$1::uuid", block_id)

# ------------------------------------------------------------------
# ALLOCATIONS
# ------------------------------------------------------------------
class AllocIn(BaseModel):
    prefix: str
    block_id: str
    customer_id: Optional[str] = None
    vlan_id: Optional[str] = None
    status: str = "active"
    owner_type: str = "customer"
    description: Optional[str] = None
    notes: Optional[str] = None

@app.get("/api/v1/allocations")
async def list_allocations(
    search: Optional[str]=Query(None),
    block_id: Optional[str]=Query(None),
    customer_id: Optional[str]=Query(None),
    status: Optional[str]=Query(None),
    limit: int=Query(100,ge=1,le=1000),
    offset: int=Query(0,ge=0),
    db=Depends(get_db)
):
    conditions, params = ["1=1"], []
    if search:
        params.append(f"%{search}%")
        conditions.append(f"(a.prefix::text ILIKE ${len(params)} OR c.name ILIKE ${len(params)} OR a.description ILIKE ${len(params)})")
    if block_id:
        params.append(block_id)
        conditions.append(f"a.block_id = ${len(params)}::uuid")
    if customer_id:
        params.append(customer_id)
        conditions.append(f"a.customer_id = ${len(params)}::uuid")
    if status:
        params.append(status)
        conditions.append(f"a.status = ${len(params)}::alloc_status_t")
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(f"""
        SELECT a.id, a.prefix::text, a.ip_version, a.status, a.owner_type, a.description, a.notes,
               a.created_at, a.updated_at, a.block_id,
               b.prefix::text AS block_prefix, b.name AS block_name,
               s.name AS site_name,
               a.customer_id, c.name AS customer_name, c.code AS customer_code,
               a.vlan_id, v.vid AS vlan_vid, v.name AS vlan_name
        FROM allocations a
        JOIN ip_blocks b ON a.block_id=b.id
        LEFT JOIN sites s ON b.site_id=s.id
        LEFT JOIN customers c ON a.customer_id=c.id
        LEFT JOIN vlans v ON a.vlan_id=v.id
        WHERE {where}
        ORDER BY a.prefix::inet
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """, *params)
    total = await db.fetchval(f"""
        SELECT COUNT(*) FROM allocations a
        JOIN ip_blocks b ON a.block_id=b.id
        LEFT JOIN customers c ON a.customer_id=c.id
        WHERE {where}
    """, *params[:-2])
    return {"total": total, "items": [dict(r) for r in rows]}

@app.post("/api/v1/allocations", status_code=201)
async def create_allocation(body: AllocIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO allocations (prefix,block_id,customer_id,vlan_id,status,owner_type,description,notes) VALUES ($1::cidr,$2::uuid,$3::uuid,$4::uuid,$5::alloc_status_t,$6::owner_type_t,$7,$8) RETURNING *",
        body.prefix, body.block_id, body.customer_id, body.vlan_id, body.status, body.owner_type, body.description, body.notes
    )
    return {**dict(row), "prefix": str(row["prefix"])}

@app.put("/api/v1/allocations/{alloc_id}")
async def update_allocation(alloc_id: str, body: AllocIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE allocations SET prefix=$1::inet,block_id=$2::uuid,customer_id=$3::uuid,vlan_id=$4::uuid,status=$5::alloc_status_t,owner_type=$6::owner_type_t,description=$7,notes=$8 WHERE id=$9::uuid RETURNING *",
        body.prefix, body.block_id, body.customer_id, body.vlan_id, body.status, body.owner_type, body.description, body.notes, alloc_id
    )
    if not row: raise HTTPException(404, "Allocation not found")
    return {**dict(row), "prefix": str(row["prefix"])}

@app.delete("/api/v1/allocations/{alloc_id}", status_code=204)
async def delete_allocation(alloc_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM allocations WHERE id=$1::uuid", alloc_id)

# ------------------------------------------------------------------
# CSV IMPORT (preview + confirm)
# ------------------------------------------------------------------
import csv, io, ipaddress
from fastapi import UploadFile, File, Form

def to_plen(size):
    if size <= 0: return 30
    b = 1
    while b < size: b <<= 1
    return 32 - int(math.log2(b))


def parse_ipv4_csv(content: str):
    lines    = content.splitlines()
    meta     = {"asn":None,"router":None,"operator":None,"prefix":None,"name":None}
    data_rows = []
    in_data  = False

    for line in lines:
        cols = [c.strip() for c in line.split(",")]
        raw  = cols[0] if cols else ""

        if raw.startswith("ASN Origin"):
            meta["asn"] = line.split(":",1)[1].strip().split(",")[0].strip(); continue
        elif raw.startswith("Router"):
            meta["router"] = line.split(":",1)[1].strip().split(",")[0].strip(); continue
        elif raw.startswith("IP Name"):
            meta["operator"] = line.split(":",1)[1].strip().split(",")[0].strip(); continue

        # Format lama: "163.61.201.0/24 | 153816" — prefix dan ASN di col0 dipisah pipe
        if "|" in raw and not meta["prefix"]:
            parts = raw.split("|")
            try:
                net = ipaddress.ip_network(parts[0].strip(), strict=False)
                if net.prefixlen <= 24:
                    meta["prefix"] = str(net); meta["name"] = str(net)
                    if len(parts) > 1 and parts[1].strip().isdigit():
                        meta["asn"] = parts[1].strip()
                continue
            except ValueError: pass
        try:
            net = ipaddress.ip_network(raw, strict=False)
            if net.prefixlen <= 24 and not meta["prefix"]:
                meta["prefix"] = str(net)
                meta["name"]   = str(net)
            continue
        except ValueError: pass

        if raw == "Alokasi":
            in_data = True; continue
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

    base_ip = str(ipaddress.ip_network(meta["prefix"], strict=False).network_address).rsplit(".",1)[0]

    # Group rows: empty name AND empty vlan = continuation of previous group
    groups = []
    cur = None
    for r in data_rows:
        if r["name"] or r["vlan"]:
            if cur: groups.append(cur)
            cur = {
                "name":  r["name"] or None,
                "vlan":  r["vlan"],
                "notes": r["notes"],
                "rows":  [r],
            }
        else:
            if cur:
                cur["rows"].append(r)
            else:
                cur = {"name": None, "vlan": "", "notes": r["notes"], "rows": [r]}
                groups.append(cur)
                cur = None
    if cur: groups.append(cur)

    # Build allocations from groups
    allocations = []
    for g in groups:
        min_net   = min(r["net"]   for r in g["rows"])
        max_bcast = max(r["bcast"] for r in g["rows"])
        size      = max_bcast - min_net + 1
        plen      = to_plen(size)
        prefix    = f"{base_ip}.{min_net}/{plen}"

        try: ipaddress.ip_network(prefix, strict=False)
        except: continue

        # Parse VLAN - handle /31 etc in vlan col
        vlan = None
        vr   = g["vlan"].strip()
        if vr.isdigit(): vlan = int(vr)
        elif " " in vr:
            for p in vr.split():
                if p.isdigit(): vlan = int(p); break

        customer = g["name"]
        allocations.append({
            "prefix":      prefix,
            "customer":    customer,
            "vlan":        vlan,
            "notes":       g["notes"],
            "plen":        plen,
            "status":      "active" if customer else "available",
            "description": customer or "",
        })

    return meta, allocations

def parse_ipv6_csv(content: str):
    lines = content.splitlines()
    meta = {"asn": None, "router": None, "operator": None, "prefix": None, "name": None}
    allocations = []

    for line in lines:
        cols = [c.strip() for c in line.split(",")]

        # IPv6 data always in col1
        if len(cols) < 2:
            continue

        col1 = cols[1].strip()
        if not col1:
            continue

        # detect parent block — col1 contains prefix + optional name
        # e.g. "2404:fd00:36::/48  - LS ZETTA Connect Plus"
        if meta["prefix"] is None:
            parts = col1.split(None, 1)  # split on whitespace
            col1_addr = parts[0].split("(")[0].strip()
            try:
                net = ipaddress.ip_network(col1_addr, strict=False)
                if net.version == 6 and net.prefixlen <= 48:
                    meta["prefix"] = str(net)
                    # extract name after " - "
                    if " - " in col1:
                        meta["name"] = col1.split(" - ", 1)[1].strip()
                    elif len(parts) > 1:
                        meta["name"] = parts[1].strip(" -")
                    continue
            except ValueError:
                pass
            continue

        # allocation rows — col1=prefix (may have suffix), col2=customer
        col1_clean = col1.split("(")[0].strip()
        side = None
        if "(" in col1 and ")" in col1:
            side = col1[col1.index("(")+1:col1.index(")")]

        # parse as ip_interface to preserve host address
        try:
            iface = ipaddress.ip_interface(col1_clean)
        except ValueError:
            continue

        if iface.version != 6:
            continue

        # store as host/prefixlen e.g. 2404:fd00:36::1/127
        prefix = f"{iface.ip}/{iface.network.prefixlen}"

        customer = cols[2].strip() if len(cols) > 2 and cols[2].strip() else None
        status   = "active" if customer else "available"

        desc = customer or ""
        if side:
            desc = f"{customer} [{side}]" if customer else f"[{side}]"

        allocations.append({
            "prefix":      prefix,
            "customer":    customer,
            "vlan":        None,
            "description": desc,
            "notes":       side or "",
            "status":      status,
        })

    return meta, allocations

@app.post("/api/v1/import/preview")
async def import_preview(file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8-sig")
    filename = file.filename or ""

    # detect IPv6 by presence of ":"
    if "ipv6" in filename.lower() or "v6" in filename.lower():
        meta, allocations = parse_ipv6_csv(content)
    else:
        first_data = "\n".join([l for l in content.splitlines() if l.strip()])
        if "::/" in first_data or "fd00" in first_data or "2404" in first_data:
            meta, allocations = parse_ipv6_csv(content)
        else:
            meta, allocations = parse_ipv4_csv(content)

    return {
        "meta":        meta,
        "allocations": allocations,
        "count":       len(allocations),
        "filename":    filename,
    }

class ImportConfirm(BaseModel):
    meta: dict
    allocations: list
    site_id: Optional[str] = None

@app.post("/api/v1/import/confirm")
async def import_confirm(body: ImportConfirm, db=Depends(get_db)):
    meta   = body.meta
    allocs = body.allocations

    if not meta.get("prefix"):
        raise HTTPException(400, "No valid parent prefix found")

    async with db.transaction():
        # upsert block
        block = await db.fetchrow("""
            INSERT INTO ip_blocks (prefix, name, asn, router, operator, site_id, status)
            VALUES ($1::cidr, $2, $3, $4, $5, $6::uuid, 'active')
            ON CONFLICT (prefix) DO UPDATE SET
                name=EXCLUDED.name, asn=EXCLUDED.asn,
                router=EXCLUDED.router, operator=EXCLUDED.operator,
                site_id=EXCLUDED.site_id, updated_at=NOW()
            RETURNING id
        """, meta["prefix"], meta.get("name") or meta["prefix"],
             meta.get("asn"), meta.get("router"), meta.get("operator"),
             body.site_id)

        block_id = block["id"]
        ok = skip = 0

        for a in allocs:
            if not a.get("prefix"):
                skip += 1
                continue
            try:
                async with db.transaction():
                    # upsert customer only if name exists
                    customer_id = None
                    cname = a.get("customer")
                    if cname and cname.strip():
                        cust = await db.fetchrow("""
                            INSERT INTO customers (name, is_active)
                            VALUES ($1, true)
                            ON CONFLICT DO NOTHING
                            RETURNING id
                        """, cname.strip())
                        if not cust:
                            cust = await db.fetchrow(
                                "SELECT id FROM customers WHERE name=$1", cname.strip())
                        customer_id = cust["id"] if cust else None

                    # upsert vlan
                    vlan_id = None
                    if a.get("vlan") and body.site_id:
                        vl = await db.fetchrow("""
                            INSERT INTO vlans (vid, site_id, status)
                            VALUES ($1, $2::uuid, 'active')
                            ON CONFLICT (vid, site_id) DO UPDATE SET updated_at=NOW()
                            RETURNING id
                        """, int(a["vlan"]), body.site_id)
                        vlan_id = vl["id"]

                    # upsert allocation
                    alloc_status = a.get("status") or "active"
                    owner_type = a.get("owner_type") or ("customer" if customer_id else "internal")
                    await db.execute("""
                        INSERT INTO allocations
                            (prefix, block_id, customer_id, vlan_id, status, owner_type, description, notes)
                        VALUES ($1::inet, $2, $3, $4, $5::alloc_status_t, $6::owner_type_t, $7, $8)
                        ON CONFLICT (prefix) DO UPDATE SET
                            block_id=EXCLUDED.block_id,
                            customer_id=EXCLUDED.customer_id,
                            vlan_id=EXCLUDED.vlan_id,
                            status=EXCLUDED.status,
                            owner_type=EXCLUDED.owner_type,
                            description=EXCLUDED.description,
                            notes=EXCLUDED.notes,
                            updated_at=NOW()
                    """, a["prefix"], block_id, customer_id, vlan_id,
                         alloc_status, owner_type, a.get("description") or "", a.get("notes") or "")
                    ok += 1
            except Exception as e:
                print(f"SKIP alloc {a.get('prefix')}: {e}")
                skip += 1

    return {"imported": ok, "skipped": skip, "block_id": str(block_id)}

# ------------------------------------------------------------------
# SEARCH
# ------------------------------------------------------------------
@app.get("/api/v1/search")
async def global_search(q: str = Query(..., min_length=2), db=Depends(get_db)):
    results = {}
    results["blocks"]      = [dict(r) for r in await db.fetch("SELECT id, prefix::text AS label, name, ip_version FROM ip_blocks WHERE prefix::text ILIKE $1 OR name ILIKE $1 LIMIT 5", f"%{q}%")]
    results["allocations"] = [dict(r) for r in await db.fetch("SELECT id, prefix::text AS label, customer_name, status FROM v_allocation_detail WHERE prefix::text ILIKE $1 OR customer_name ILIKE $1 LIMIT 10", f"%{q}%")]
    results["customers"]   = [dict(r) for r in await db.fetch("SELECT id, name AS label, code FROM customers WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 5", f"%{q}%")]
    return results
