from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from models.schemas import VlanIn
from core.database import get_db

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
async def create_vlan(body: VlanIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO vlans (vid,name,site_id,status,description,source) VALUES ($1,$2,$3::uuid,$4::vlan_status_t,$5,$6) RETURNING *",
        body.vid, body.name, body.site_id, body.status, body.description, body.source or "dynamic"
    )
    return dict(row)

@router.put("/api/v1/vlans/{vlan_id}")
async def update_vlan(vlan_id: str, body: VlanIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE vlans SET vid=$1,name=$2,site_id=$3::uuid,status=$4::vlan_status_t,description=$5,source=$6 WHERE id=$7::uuid RETURNING *",
        body.vid, body.name, body.site_id, body.status, body.description, body.source or "dynamic", vlan_id
    )
    if not row: raise HTTPException(404, "VLAN not found")
    return dict(row)

@router.delete("/api/v1/vlans/{vlan_id}", status_code=204)
async def delete_vlan(vlan_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM vlans WHERE id=$1::uuid", vlan_id)
