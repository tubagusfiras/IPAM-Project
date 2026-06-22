from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from models.schemas import BlockIn
from core.database import get_db

router = APIRouter(tags=["IP Blocks"])

@router.get("/api/v1/blocks")
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

@router.get("/api/v1/blocks/{block_id}")
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

@router.post("/api/v1/blocks", status_code=201)
async def create_block(body: BlockIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO ip_blocks (prefix,name,asn,router,operator,site_id,status,description) VALUES ($1::cidr,$2,$3,$4,$5,$6::uuid,$7::block_status_t,$8) RETURNING *",
        body.prefix, body.name, body.asn, body.router, body.operator, body.site_id, body.status, body.description
    )
    return {**dict(row), "prefix": str(row["prefix"])}

@router.put("/api/v1/blocks/{block_id}")
async def update_block(block_id: str, body: BlockIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE ip_blocks SET prefix=$1::cidr,name=$2,asn=$3,router=$4,operator=$5,site_id=$6::uuid,status=$7::block_status_t,description=$8 WHERE id=$9::uuid RETURNING *",
        body.prefix, body.name, body.asn, body.router, body.operator, body.site_id, body.status, body.description, block_id
    )
    if not row: raise HTTPException(404, "Block not found")
    return {**dict(row), "prefix": str(row["prefix"])}

@router.delete("/api/v1/blocks/{block_id}", status_code=204)
async def delete_block(block_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM ip_blocks WHERE id=$1::uuid", block_id)
