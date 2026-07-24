import base64, json
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from models.schemas import AllocIn
from core.database import get_db

router = APIRouter(tags=["Allocations"])

@router.get("/api/v1/allocations")
async def list_allocations(
    search: Optional[str]=Query(None),
    block_id: Optional[str]=Query(None),
    customer_id: Optional[str]=Query(None),
    vlan_id: Optional[str]=Query(None),
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
        ids = [x.strip() for x in customer_id.split(",") if x.strip()]
        if len(ids) > 1:
            params.append(ids)
            conditions.append(f"a.customer_id = ANY(${len(params)}::uuid[])")
        else:
            params.append(ids[0])
            conditions.append(f"a.customer_id = ${len(params)}::uuid")
    if vlan_id:
        ids = [x.strip() for x in vlan_id.split(",") if x.strip()]
        if len(ids) > 1:
            params.append(ids)
            conditions.append(f"a.vlan_id = ANY(${len(params)}::uuid[])")
        else:
            params.append(ids[0])
            conditions.append(f"a.vlan_id = ${len(params)}::uuid")
    if status:
        params.append(status)
        conditions.append(f"a.status = ${len(params)}::alloc_status_t")
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(f"""
        SELECT a.id, a.prefix::text, a.ip_version, a.status, a.owner_type, a.description, a.notes,
               a.created_at, a.updated_at, a.block_id,
               b.prefix::text AS block_prefix, b.name AS block_name,
               b.router AS block_router, b.asn AS block_asn,
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

@router.get("/api/v1/allocations/cursor", summary="List allocations with cursor pagination", tags=["Allocations"])
async def list_allocations_cursor(
    cursor: Optional[str] = Query(None, description="Base64 cursor from previous response"),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str]=Query(None),
    block_id: Optional[str]=Query(None),
    customer_id: Optional[str]=Query(None),
    db=Depends(get_db)
):
    conditions, params = ["1=1"], []
    if search:
        params.append(f"%{search}%")
        conditions.append(f"(a.prefix::text ILIKE ${len(params)} OR c.name ILIKE ${len(params)})")
    if block_id:
        params.append(block_id)
        conditions.append(f"a.block_id = ${len(params)}::uuid")
    if customer_id:
        params.append(customer_id)
        conditions.append(f"a.customer_id = ${len(params)}::uuid")

    if cursor:
        try:
            dec = json.loads(base64.b64decode(cursor).decode())
            params.append(dec["prefix"])
            conditions.append(f"a.prefix::inet < ${len(params)}::inet")
        except:
            raise HTTPException(400, "Invalid cursor")

    where = " AND ".join(conditions)
    params.append(limit + 1)
    rows = await db.fetch(f"""
        SELECT a.id, a.prefix::text, a.ip_version, a.status, a.owner_type, a.description, a.notes,
               a.created_at, a.updated_at,
               b.prefix::text AS block_prefix, c.name AS customer_name, c.code AS customer_code
        FROM allocations a
        JOIN ip_blocks b ON a.block_id=b.id
        LEFT JOIN customers c ON a.customer_id=c.id
        WHERE {where}
        ORDER BY a.prefix::inet DESC
        LIMIT ${len(params)}
    """, *params)

    has_more = len(rows) > limit
    if has_more: rows = rows[:-1]
    items = [dict(r) for r in rows]
    next_cursor = None
    if has_more and items:
        next_cursor = base64.b64encode(json.dumps({"prefix": str(items[-1]["prefix"])}).encode()).decode()
    return {"items": items, "next_cursor": next_cursor, "has_more": has_more}

@router.post("/api/v1/allocations", status_code=201)
async def create_allocation(body: AllocIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO allocations (prefix,block_id,customer_id,vlan_id,status,owner_type,description,notes) VALUES ($1::cidr,$2::uuid,$3::uuid,$4::uuid,$5::alloc_status_t,$6::owner_type_t,$7,$8) RETURNING *",
        body.prefix, body.block_id, body.customer_id, body.vlan_id, body.status, body.owner_type, body.description, body.notes
    )
    return {**dict(row), "prefix": str(row["prefix"])}

@router.put("/api/v1/allocations/{alloc_id}")
async def update_allocation(alloc_id: str, body: AllocIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE allocations SET prefix=$1::inet,block_id=$2::uuid,customer_id=$3::uuid,vlan_id=$4::uuid,status=$5::alloc_status_t,owner_type=$6::owner_type_t,description=$7,notes=$8 WHERE id=$9::uuid RETURNING *",
        body.prefix, body.block_id, body.customer_id, body.vlan_id, body.status, body.owner_type, body.description, body.notes, alloc_id
    )
    if not row: raise HTTPException(404, "Allocation not found")
    return {**dict(row), "prefix": str(row["prefix"])}

@router.delete("/api/v1/allocations/{alloc_id}", status_code=204)
async def delete_allocation(alloc_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM allocations WHERE id=$1::uuid", alloc_id)
