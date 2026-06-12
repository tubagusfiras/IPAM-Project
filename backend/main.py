from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime
import os, json, math, ipaddress

import asyncpg
from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io
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

# ------------------------------------------------------------------
# EXPORT
# ------------------------------------------------------------------

def _ip_to_int(ip):
    p = list(map(int, ip.split(".")))
    return (p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3]

def _int_to_ip(n):
    return f"{(n>>24)&255}.{(n>>16)&255}.{(n>>8)&255}.{n&255}"

def _calc_usable(prefix):
    try:
        addr, plen = prefix.split("/")
        plen = int(plen)
        base = _ip_to_int(addr)
        size = 2**(32-plen)
        if size <= 2:
            return f"{_int_to_ip(base)} - {_int_to_ip(base+size-1)}"
        return f"{_int_to_ip(base+1)} - {_int_to_ip(base+size-2)}"
    except:
        return ""

def _calc_gaps(alloc_prefixes, block_prefix):
    try:
        addr, plen = block_prefix.split("/")
        b_start = _ip_to_int(addr)
        b_end = b_start + 2**(32-int(plen)) - 1
        sorted_p = sorted(alloc_prefixes, key=lambda p: _ip_to_int(p.split("/")[0]))
        gaps, cursor = [], b_start
        for p in sorted_p:
            a_start = _ip_to_int(p.split("/")[0])
            a_end = a_start + 2**(32-int(p.split("/")[1])) - 1
            if a_start > cursor:
                gaps.append({"range": f"{_int_to_ip(cursor)} - {_int_to_ip(a_start-1)}", "size": a_start-cursor})
            cursor = max(cursor, a_end+1)
        if cursor <= b_end:
            gaps.append({"range": f"{_int_to_ip(cursor)} - {_int_to_ip(b_end)}", "size": b_end-cursor+1})
        return gaps
    except:
        return []

OWNER_LABELS = {"customer":"Customer","internal":"Internal","ptp":"PTP","peering":"Peering","management":"Management","reserved":"Reserved"}
STATUS_COLORS = {"active":"FF22c55e","reserved":"FF71717a","available":"FF38e8c6","deprecated":"FFef4444"}
OWNER_COLORS  = {"customer":"FF3b82f6","internal":"FF22c55e","ptp":"FFf59e0b","peering":"FFa855f7","management":"FF0ea5e9","reserved":"FF71717a"}

def _thin_border():
    s = Side(style="thin", color="FFe2e8f0")
    return Border(left=s, right=s, top=s, bottom=s)


def _build_summary_sheet(ws, block, allocs):
    bdr = _thin_border()
    left   = Alignment(horizontal="left",   vertical="center")
    center = Alignment(horizontal="center", vertical="center")

    used  = int(block.get("used_ips") or 0)
    total = int(block.get("total_ips") or 1)
    free  = max(0, total-used)
    pct   = round(used/total*100,1) if total else 0
    pct_color = "FFef4444" if pct>85 else "FFf59e0b" if pct>60 else "FF22c55e"

    col_widths = [22,14,20,30,16,14,14]
    for i,w in enumerate(col_widths,1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Row 1: Title
    ws.merge_cells("A1:E1")
    ws["A1"] = str(block["prefix"])
    ws["A1"].font = Font(name="Calibri",bold=True,size=20,color="FF3b82f6")
    ws["A1"].alignment = left
    ws["A1"].fill = PatternFill("solid",start_color="FF0a0f1e")
    ws.row_dimensions[1].height = 36

    ws.merge_cells("F1:G1")
    ws["F1"] = str(block.get("status","")).upper()
    sc = "FF22c55e" if block.get("status")=="active" else "FF71717a"
    ws["F1"].font = Font(name="Calibri",bold=True,size=11,color=sc)
    ws["F1"].fill = PatternFill("solid",start_color="FF0a0f1e")
    ws["F1"].alignment = center
    ms = Side(style="medium",color=sc)
    ws["F1"].border = Border(left=ms,right=ms,top=ms,bottom=ms)

    # Row 2-3: Info
    labels = ["NAME","ASN","ROUTER","OPERATOR","SITE","",""]
    values = [block.get("name",""),block.get("asn",""),block.get("router",""),
              block.get("operator",""),block.get("site_name",""),"",""]
    for i,(lbl,val) in enumerate(zip(labels,values),1):
        cl = ws.cell(row=2,column=i,value=lbl)
        cl.font=Font(name="Calibri",bold=True,size=8,color="FF64748b")
        cl.fill=PatternFill("solid",start_color="FF0d1424"); cl.alignment=left
        cv = ws.cell(row=3,column=i,value=val)
        cv.font=Font(name="Courier New" if i in (2,3) else "Calibri",bold=True,size=11,
                     color="FFFFFFFF" if val else "FF334155")
        cv.fill=PatternFill("solid",start_color="FF0d1424"); cv.alignment=left
    ws.row_dimensions[2].height=13; ws.row_dimensions[3].height=22

    # Row 4: spacer
    for i in range(1,8):
        ws.cell(row=4,column=i).fill=PatternFill("solid",start_color="FF1e293b")
    ws.row_dimensions[4].height=6

    # Rows 5-6: Stats
    active_c = len([a for a in allocs if a.get("status")=="active"])
    resvd_c  = len([a for a in allocs if a.get("status")=="reserved"])
    stats = [("TOTAL ALLOC",str(len(allocs)),"FFFFFFFF"),
             ("ACTIVE",str(active_c),"FF22c55e"),
             ("RESERVED",str(resvd_c),"FF71717a"),
             ("FREE IPs",f"{free:,}","FF38e8c6"),
             ("USED IPs",f"{used:,}","FF3b82f6"),
             ("TOTAL IPs",f"{total:,}","FF94a3b8"),
             ("UTILIZATION",f"{pct}%",pct_color)]
    for i,(lbl,val,col) in enumerate(stats,1):
        fill=PatternFill("solid",start_color="FF0f172a")
        cl=ws.cell(row=5,column=i,value=lbl)
        cl.font=Font(name="Calibri",bold=True,size=8,color="FF64748b")
        cl.fill=fill; cl.border=bdr; cl.alignment=left
        cv=ws.cell(row=6,column=i,value=val)
        cv.font=Font(name="Calibri",bold=True,size=18,color=col)
        cv.fill=fill; cv.border=bdr; cv.alignment=left
    ws.row_dimensions[5].height=15; ws.row_dimensions[6].height=34

    # Row 7: util bar
    filled=max(1,round(pct/100*7)) if pct>0 else 0
    for i in range(1,8):
        ws.cell(row=7,column=i).fill=PatternFill("solid",
            start_color=pct_color if i<=filled else "FF1e293b")
    ws.row_dimensions[7].height=10

    # Row 8: spacer
    for i in range(1,8):
        ws.cell(row=8,column=i).fill=PatternFill("solid",start_color="FF1e293b")
    ws.row_dimensions[8].height=6

    # Rows 9-11: Type breakdown
    owner_labels={"customer":"Customer","internal":"Internal","ptp":"PTP",
                  "peering":"Peering","management":"Mgmt","reserved":"Reserved"}
    owner_colors={"customer":"FF3b82f6","internal":"FF22c55e","ptp":"FFf59e0b",
                  "peering":"FFa855f7","management":"FF0ea5e9","reserved":"FF71717a"}
    owner_counts={}
    for a in allocs:
        o=a.get("owner_type","customer")
        owner_counts[o]=owner_counts.get(o,0)+1

    ws.cell(row=9,column=1,value="TYPE BREAKDOWN").font=Font(name="Calibri",bold=True,size=8,color="FF64748b")
    ws.cell(row=9,column=1).fill=PatternFill("solid",start_color="FF0d1424")
    ws.row_dimensions[9].height=14

    for i,(k,v) in enumerate(owner_counts.items(),1):
        oc=owner_colors.get(k,"FF94a3b8")
        fill=PatternFill("solid",start_color="FF0f172a")
        lbl=ws.cell(row=10,column=i,value=owner_labels.get(k,k))
        lbl.font=Font(name="Calibri",bold=True,size=9,color=oc)
        lbl.fill=fill; lbl.border=bdr; lbl.alignment=left
        val=ws.cell(row=11,column=i,value=v)
        val.font=Font(name="Calibri",bold=True,size=20,color=oc)
        val.fill=fill; val.border=bdr; val.alignment=left
    ws.row_dimensions[10].height=16; ws.row_dimensions[11].height=34

    ws.sheet_view.showGridLines=False


def _build_block_sheet_allocs(ws, block, allocs):
    hdr_font = Font(name="Arial", bold=True, color="FFFFFFFF", size=10)
    hdr_fill = PatternFill("solid", start_color="FF1e293b")
    bdr = _thin_border()
    center = Alignment(horizontal="center", vertical="center")
    left   = Alignment(horizontal="left",   vertical="center")

    ws.merge_cells("A1:H1")
    ws["A1"] = f"Block: {block['prefix']}"
    ws["A1"].font = Font(name="Arial", bold=True, size=14, color="FF3b82f6")
    ws["A1"].alignment = left
    ws.row_dimensions[1].height = 28

    info = [("Name",block.get("name","")),("ASN",block.get("asn","")),
            ("Router",block.get("router","")),("Operator",block.get("operator","")),
            ("Site",block.get("site_name","")),("Status",str(block.get("status","")).upper())]
    for i,(k,v) in enumerate(info):
        col = (i%3)*2+1
        row = 2+i//3
        ws.cell(row=row,column=col,value=k).font = Font(name="Arial",bold=True,size=9,color="FF94a3b8")
        ws.cell(row=row,column=col+1,value=v).font = Font(name="Arial",size=10)

    used  = int(block.get("used_ips") or 0)
    total = int(block.get("total_ips") or 1)
    pct   = round(used/total*100,1) if total else 0
    ws.merge_cells("A4:H4")
    ws["A4"] = f"Utilization: {used:,} / {total:,} IPs  ({pct}%)"
    ws["A4"].font = Font(name="Arial",bold=True,size=10,
        color="FFef4444" if pct>85 else "FFf59e0b" if pct>60 else "FF22c55e")
    ws.row_dimensions[4].height = 20

    headers   = ["#","Prefix","Usable Range","Size","Type","Customer / Description","VLAN","Status"]
    col_widths = [4,  22,      30,            8,     12,    35,                     8,     12]
    for i,(h,w) in enumerate(zip(headers,col_widths),1):
        c = ws.cell(row=6,column=i,value=h)
        c.font=hdr_font; c.fill=hdr_fill; c.alignment=center; c.border=bdr
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[6].height=22

    is_v6 = ":" in str(block.get("prefix",""))
    sorted_allocs = sorted(allocs, key=lambda a: _ip_to_int(a["prefix"].split("/")[0]) if not is_v6 else 0)
    gaps = [] if is_v6 else _calc_gaps([a["prefix"] for a in sorted_allocs], str(block["prefix"]))

    rows = [{"_free":False,**a} for a in sorted_allocs]
    for g in gaps:
        rows.append({"_free":True,**g})
    if not is_v6:
        rows.sort(key=lambda r: _ip_to_int(r["prefix"].split("/")[0]) if not r["_free"] else _ip_to_int(r["range"].split(" - ")[0]))

    alloc_idx = 0
    for r_idx,row in enumerate(rows,7):
        ws.row_dimensions[r_idx].height=18
        if row["_free"]:
            ff = PatternFill("solid",start_color="FF0a1a0f")
            for col in range(1,9):
                c=ws.cell(row=r_idx,column=col); c.fill=ff; c.border=bdr
            ws.cell(row=r_idx,column=1,value="-").font=Font(name="Arial",size=9,color="FF334155")
            ws.cell(row=r_idx,column=2,value=row["range"]).font=Font(name="Courier New",size=9,italic=True,color="FF22c55e")
            ws.cell(row=r_idx,column=3,value="Free").font=Font(name="Arial",size=9,italic=True,color="FF22c55e")
            ws.cell(row=r_idx,column=4,value=row["size"]).font=Font(name="Arial",size=9,color="FF22c55e")
            ws.cell(row=r_idx,column=5,value="FREE").font=Font(name="Arial",size=9,color="FF22c55e")
            ws.cell(row=r_idx,column=8,value="AVAILABLE").font=Font(name="Arial",size=9,color="FF22c55e")
        else:
            alloc_idx+=1
            owner  = row.get("owner_type","customer")
            status = row.get("status","active")
            o_color = OWNER_COLORS.get(owner,"FF94a3b8")
            s_color = STATUS_COLORS.get(status,"FF94a3b8")
            rf = PatternFill("solid",start_color="FF0f172a" if alloc_idx%2==0 else "FF111827")
            try: size = 2**(32-int(row["prefix"].split("/")[1])) if not is_v6 else "-"
            except: size="-"
            for col in range(1,9):
                c=ws.cell(row=r_idx,column=col); c.fill=rf; c.border=bdr; c.alignment=left
            ws.cell(row=r_idx,column=1,value=alloc_idx).font=Font(name="Arial",size=9,color="FF94a3b8")
            ws.cell(row=r_idx,column=1).alignment=center
            ws.cell(row=r_idx,column=2,value=row["prefix"]).font=Font(name="Courier New",bold=True,size=10,color="FF3b82f6")
            ws.cell(row=r_idx,column=3,value=_calc_usable(row["prefix"])).font=Font(name="Courier New",size=9,color="FF94a3b8")
            ws.cell(row=r_idx,column=4,value=size).font=Font(name="Arial",size=9,color="FF64748b")
            ws.cell(row=r_idx,column=4).alignment=center
            ws.cell(row=r_idx,column=5,value=OWNER_LABELS.get(owner,owner)).font=Font(name="Arial",bold=True,size=9,color=o_color)
            desc = row.get("customer_name") or row.get("description") or ""
            ws.cell(row=r_idx,column=6,value=desc).font=Font(name="Arial",size=10)
            vlan = row.get("vlan_vid")
            ws.cell(row=r_idx,column=7,value=str(vlan) if vlan else "").font=Font(name="Courier New",size=9,color="FF94a3b8")
            ws.cell(row=r_idx,column=7).alignment=center
            ws.cell(row=r_idx,column=8,value=status.upper()).font=Font(name="Arial",bold=True,size=9,color=s_color)
            ws.cell(row=r_idx,column=8).alignment=center

    ws.freeze_panes="A7"
    ws.sheet_view.showGridLines=False

BLOCK_QUERY = """
    SELECT b.*, s.name AS site_name,
           CASE WHEN family(b.prefix)=4 THEN
               COALESCE(SUM(CASE WHEN a.status='active' AND a.prefix::cidr!=b.prefix
                   AND NOT EXISTS(SELECT 1 FROM allocations a2 WHERE a2.block_id=b.id
                       AND a2.id!=a.id AND a2.prefix::cidr>>a.prefix::cidr AND a2.status='active')
                   THEN (2::bigint^(32-masklen(a.prefix::cidr))) ELSE 0 END),0)::numeric
           ELSE 0 END AS used_ips,
           CASE WHEN family(b.prefix)=4 THEN (2::bigint^(32-masklen(b.prefix)))::numeric
           ELSE 0 END AS total_ips
    FROM ip_blocks b LEFT JOIN sites s ON b.site_id=s.id
    LEFT JOIN allocations a ON a.block_id=b.id
    WHERE b.id=$1::uuid GROUP BY b.id,s.name
"""

ALLOC_QUERY = """
    SELECT a.prefix::text, a.status, a.owner_type, a.description, a.notes,
           c.name AS customer_name, v.vid AS vlan_vid
    FROM allocations a
    LEFT JOIN customers c ON a.customer_id=c.id
    LEFT JOIN vlans v ON a.vlan_id=v.id
    WHERE a.block_id=$1::uuid ORDER BY a.prefix::inet
"""

ALL_BLOCKS_QUERY = """
    SELECT b.*, s.name AS site_name,
           CASE WHEN family(b.prefix)=4 THEN
               COALESCE(SUM(CASE WHEN a.status='active' AND a.prefix::cidr!=b.prefix
                   AND NOT EXISTS(SELECT 1 FROM allocations a2 WHERE a2.block_id=b.id
                       AND a2.id!=a.id AND a2.prefix::cidr>>a.prefix::cidr AND a2.status='active')
                   THEN (2::bigint^(32-masklen(a.prefix::cidr))) ELSE 0 END),0)::numeric
           ELSE 0 END AS used_ips,
           CASE WHEN family(b.prefix)=4 THEN (2::bigint^(32-masklen(b.prefix)))::numeric
           ELSE 0 END AS total_ips
    FROM ip_blocks b LEFT JOIN sites s ON b.site_id=s.id
    LEFT JOIN allocations a ON a.block_id=b.id
    GROUP BY b.id,s.name ORDER BY b.prefix::inet
"""

@app.get("/api/v1/export/block/{block_id}")
async def export_block(block_id: str, db=Depends(get_db)):
    row = await db.fetchrow(BLOCK_QUERY, block_id)
    if not row: raise HTTPException(404, "Block not found")
    allocs = await db.fetch(ALLOC_QUERY, block_id)
    allocs_list = [dict(a) for a in allocs]
    block_dict = dict(row)
    wb = openpyxl.Workbook()
    ws_sum = wb.active
    ws_sum.title = "Summary"
    _build_summary_sheet(ws_sum, block_dict, allocs_list)
    ws_alloc = wb.create_sheet(title="Allocations")
    _build_block_sheet_allocs(ws_alloc, block_dict, allocs_list)
    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    fname = f"IPAM_{str(row['prefix']).replace('/','_').replace('.','_')}.xlsx"
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"})

@app.post("/api/v1/export/blocks")
async def export_blocks(body: dict, db=Depends(get_db)):
    block_ids = body.get("block_ids", [])
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for bid in block_ids:
        row = await db.fetchrow(BLOCK_QUERY, bid)
        if not row: continue
        allocs = await db.fetch(ALLOC_QUERY, bid)
        allocs_list = [dict(a) for a in allocs]
        block_dict = dict(row)
        ws_sum = wb.create_sheet(title=str(row["prefix"]).replace("/","_")[:28]+"_S")
        _build_summary_sheet(ws_sum, block_dict, allocs_list)
        ws_alloc = wb.create_sheet(title=str(row["prefix"]).replace("/","_")[:28]+"_A")
        _build_block_sheet_allocs(ws_alloc, block_dict, allocs_list)
    ws_sum = wb.create_sheet(title="Summary", index=0)
    hdr_font = Font(name="Arial",bold=True,color="FFFFFFFF",size=10)
    hdr_fill = PatternFill("solid",start_color="FF1e293b")
    bdr = _thin_border()
    hdrs   = ["#","Prefix","Name","ASN","Router","Site","Used IPs","Total IPs","Util %","Status"]
    widths = [4,   22,      25,    12,   20,      15,    12,        12,         10,      12]
    for i,(h,w) in enumerate(zip(hdrs,widths),1):
        c=ws_sum.cell(row=1,column=i,value=h)
        c.font=hdr_font; c.fill=hdr_fill; c.border=bdr
        c.alignment=Alignment(horizontal="center")
        ws_sum.column_dimensions[get_column_letter(i)].width=w
    ws_sum.row_dimensions[1].height=22
    all_blocks = await db.fetch(ALL_BLOCKS_QUERY)
    for i,b in enumerate(all_blocks,2):
        used=int(b["used_ips"] or 0); total=int(b["total_ips"] or 1)
        pct=round(used/total*100,1) if total else 0
        s_color="FFef4444" if pct>85 else "FFf59e0b" if pct>60 else "FF22c55e"
        rf=PatternFill("solid",start_color="FF0f172a" if i%2==0 else "FF111827")
        vals=[i-1,str(b["prefix"]),b.get("name",""),b.get("asn",""),b.get("router",""),
              b.get("site_name",""),used,total,pct,str(b.get("status","")).upper()]
        for j,v in enumerate(vals,1):
            c=ws_sum.cell(row=i,column=j,value=v)
            c.fill=rf; c.border=bdr; c.font=Font(name="Arial",size=10)
            if j==9: c.font=Font(name="Arial",bold=True,size=10,color=s_color)
        ws_sum.row_dimensions[i].height=18
    ws_sum.freeze_panes="A2"
    ws_sum.sheet_view.showGridLines=False
    buf=io.BytesIO()
    wb.save(buf); buf.seek(0)
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=IPAM_Export.xlsx"})

@app.get("/api/v1/export/summary")
async def export_summary(db=Depends(get_db)):
    return await export_blocks({"block_ids": []}, db)


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
