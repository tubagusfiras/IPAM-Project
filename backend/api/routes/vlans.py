from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import Optional
from models.schemas import VlanIn
from core.database import get_db
from core.security import get_current_user
from core.audit import log_audit, get_client_ip

router = APIRouter(tags=["VLANs"])

@router.get("/api/v1/vlans")
async def list_vlans(
    search: Optional[str]=Query(None),
    site_id: Optional[str]=Query(None),
    source: Optional[str]=Query(None, description="Filter by source: static or dynamic"),
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
    if source:
        params.append(source)
        conditions.append(f"v.source = ${len(params)}")
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

@router.post("/api/v1/vlans", status_code=201)
async def create_vlan(body: VlanIn, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    row = await db.fetchrow(
        "INSERT INTO vlans (vid,name,site_id,status,description,source) VALUES ($1,$2,$3::uuid,$4::vlan_status_t,$5,$6) RETURNING *",
        body.vid, body.name, body.site_id, body.status, body.description, body.source or "dynamic"
    )
    await log_audit(db, "create", "vlan", row["id"], f"VLAN {body.vid}",
        description=f"VLAN created: {body.vid} ({body.name or 'unnamed'})", new_data=dict(row),
        changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request),
        vlan_id=str(row["id"]))
    return dict(row)

@router.put("/api/v1/vlans/{vlan_id}")
async def update_vlan(vlan_id: str, body: VlanIn, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    old_row = await db.fetchrow("SELECT * FROM vlans WHERE id=$1::uuid", vlan_id)
    row = await db.fetchrow(
        "UPDATE vlans SET vid=$1,name=$2,site_id=$3::uuid,status=$4::vlan_status_t,description=$5,source=$6 WHERE id=$7::uuid RETURNING *",
        body.vid, body.name, body.site_id, body.status, body.description, body.source or "dynamic", vlan_id
    )
    if not row: raise HTTPException(404, "VLAN not found")
    await log_audit(db, "update", "vlan", vlan_id, f"VLAN {body.vid}",
        description=f"VLAN updated: {body.vid} ({body.name or 'unnamed'})",
        old_data=dict(old_row) if old_row else None, new_data=dict(row),
        changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request),
        vlan_id=vlan_id)
    return dict(row)

@router.delete("/api/v1/vlans/{vlan_id}", status_code=204)
async def delete_vlan(vlan_id: str, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    old_row = await db.fetchrow("SELECT * FROM vlans WHERE id=$1::uuid", vlan_id)
    await db.execute("DELETE FROM vlans WHERE id=$1::uuid", vlan_id)
    if old_row:
        await log_audit(db, "delete", "vlan", vlan_id, f"VLAN {old_row['vid']}",
            description=f"VLAN deleted: {old_row['vid']}", old_data=dict(old_row),
            changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request),
            vlan_id=vlan_id)
