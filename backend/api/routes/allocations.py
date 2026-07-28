import base64, json
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import Optional
from models.schemas import AllocIn
from core.database import get_db
from core.security import get_current_user
from core.audit import log_audit, get_client_ip

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
async def _maybe_rename_vlan(db, vlan_id, owner_name):
    """Auto-name a VLAN from the allocation's Owner/Customer value, but only
    if the VLAN doesn't already have a name — never overwrites an existing
    name, whether it was set automatically before or typed in manually."""
    if not vlan_id or not owner_name:
        return
    vlan_row = await db.fetchrow("SELECT name FROM vlans WHERE id=$1::uuid", vlan_id)
    if vlan_row and not vlan_row["name"]:
        await db.execute("UPDATE vlans SET name=$1 WHERE id=$2::uuid", owner_name, vlan_id)


async def _maybe_fill_vlan_site(db, vlan_id, block_id):
    """Auto-fill a VLAN's site from its allocation's block, but only if the
    VLAN doesn't already have a site set, and only if doing so wouldn't
    violate the (vid, site_id) uniqueness constraint (another VLAN row with
    the same VID already claims that site)."""
    if not vlan_id or not block_id:
        return
    vlan_row = await db.fetchrow("SELECT vid, site_id FROM vlans WHERE id=$1::uuid", vlan_id)
    if not vlan_row or vlan_row["site_id"]:
        return
    block_row = await db.fetchrow("SELECT site_id FROM ip_blocks WHERE id=$1::uuid", block_id)
    if not block_row or not block_row["site_id"]:
        return
    conflict = await db.fetchrow(
        "SELECT id FROM vlans WHERE vid=$1 AND site_id=$2::uuid AND id!=$3::uuid",
        vlan_row["vid"], block_row["site_id"], vlan_id
    )
    if conflict:
        return
    await db.execute("UPDATE vlans SET site_id=$1::uuid WHERE id=$2::uuid", block_row["site_id"], vlan_id)


async def create_allocation(body: AllocIn, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    row = await db.fetchrow(
        "INSERT INTO allocations (prefix,block_id,customer_id,vlan_id,status,owner_type,description,notes,end_device_xc) VALUES ($1::cidr,$2::uuid,$3::uuid,$4::uuid,$5::alloc_status_t,$6::owner_type_t,$7,$8,$9) RETURNING *",
        body.prefix, body.block_id, body.customer_id, body.vlan_id, body.status, body.owner_type, body.description, body.notes, body.end_device_xc
    )
    if body.vlan_id:
        owner_name = None
        if body.owner_type == "customer" and body.customer_id:
            cust = await db.fetchrow("SELECT name FROM customers WHERE id=$1::uuid", body.customer_id)
            owner_name = cust["name"] if cust else None
        else:
            owner_name = body.description
        await _maybe_rename_vlan(db, body.vlan_id, owner_name)
        await _maybe_fill_vlan_site(db, body.vlan_id, body.block_id)
    # Auto-activate the parent block: a block with a real allocation inside it
    # should never be shown as idle/available. Only fires when the block is
    # not already active, so it never overwrites a manually-set state unnecessarily.
    block_row = await db.fetchrow("SELECT status FROM ip_blocks WHERE id=$1::uuid", body.block_id)
    if block_row and block_row["status"] != "active":
        await db.execute("UPDATE ip_blocks SET status='active' WHERE id=$1::uuid", body.block_id)
        await log_audit(db, "update", "block", body.block_id, None,
            description=f"Block auto-activated (allocation {row['prefix']} created)",
            old_data={"status": block_row["status"]}, new_data={"status": "active"},
            changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request))
    await log_audit(db, "create", "allocation", row["id"], str(row["prefix"]),
        description=f"Allocation created: {row['prefix']}", new_data={**dict(row),"prefix":str(row["prefix"])},
        changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request),
        customer_id=str(body.customer_id) if body.customer_id else None,
        vlan_id=str(body.vlan_id) if body.vlan_id else None)
    return {**dict(row), "prefix": str(row["prefix"])}

@router.put("/api/v1/allocations/{alloc_id}")
async def update_allocation(alloc_id: str, body: AllocIn, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    old_row = await db.fetchrow("SELECT * FROM allocations WHERE id=$1::uuid", alloc_id)
    row = await db.fetchrow(
        "UPDATE allocations SET prefix=$1::inet,block_id=$2::uuid,customer_id=$3::uuid,vlan_id=$4::uuid,status=$5::alloc_status_t,owner_type=$6::owner_type_t,description=$7,notes=$8,end_device_xc=$9 WHERE id=$10::uuid RETURNING *",
        body.prefix, body.block_id, body.customer_id, body.vlan_id, body.status, body.owner_type, body.description, body.notes, body.end_device_xc, alloc_id
    )
    if not row: raise HTTPException(404, "Allocation not found")
    if body.vlan_id:
        owner_name = None
        if body.owner_type == "customer" and body.customer_id:
            cust = await db.fetchrow("SELECT name FROM customers WHERE id=$1::uuid", body.customer_id)
            owner_name = cust["name"] if cust else None
        else:
            owner_name = body.description
        await _maybe_rename_vlan(db, body.vlan_id, owner_name)
        await _maybe_fill_vlan_site(db, body.vlan_id, body.block_id)
    old_dict = {**dict(old_row),"prefix":str(old_row["prefix"])} if old_row else None
    await log_audit(db, "update", "allocation", alloc_id, str(row["prefix"]),
        description=f"Allocation updated: {row['prefix']}",
        old_data=old_dict, new_data={**dict(row),"prefix":str(row["prefix"])},
        changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request),
        customer_id=str(body.customer_id) if body.customer_id else None,
        vlan_id=str(body.vlan_id) if body.vlan_id else None)
    return {**dict(row), "prefix": str(row["prefix"])}

@router.delete("/api/v1/allocations/{alloc_id}", status_code=204)
async def delete_allocation(alloc_id: str, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    old_row = await db.fetchrow("SELECT * FROM allocations WHERE id=$1::uuid", alloc_id)
    await db.execute("DELETE FROM allocations WHERE id=$1::uuid", alloc_id)
    if old_row:
        await log_audit(db, "delete", "allocation", alloc_id, str(old_row["prefix"]),
            description=f"Allocation deleted: {old_row['prefix']}",
            old_data={**dict(old_row),"prefix":str(old_row["prefix"])},
            changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request),
            customer_id=str(old_row["customer_id"]) if old_row["customer_id"] else None,
            vlan_id=str(old_row["vlan_id"]) if old_row["vlan_id"] else None)
