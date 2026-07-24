from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import Optional
from models.schemas import SiteIn
from core.database import get_db
from core.cache import cache_get, cache_set, cache_del
from core.security import get_current_user
from core.audit import log_audit, get_client_ip

router = APIRouter(tags=["Sites"])

@router.get("/api/v1/sites")
async def list_sites(search: Optional[str]=Query(None), db=Depends(get_db)):
    if search:  # skip cache for search
        q = f"%{search}%" if search else "%"
        rows = await db.fetch("SELECT * FROM sites WHERE name ILIKE $1 OR city ILIKE $1 ORDER BY name", q)
        return [dict(r) for r in rows]
    cached = await cache_get("sites:list")
    if cached: return cached
    rows = await db.fetch("SELECT * FROM sites ORDER BY name")
    result = [dict(r) for r in rows]
    await cache_set("sites:list", result)
    return result

@router.post("/api/v1/sites", status_code=201)
async def create_site(body: SiteIn, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    row = await db.fetchrow(
        "INSERT INTO sites (name,city,region,description) VALUES ($1,$2,$3,$4) RETURNING *",
        body.name, body.city, body.region, body.description
    )
    await cache_del("sites:list")
    await log_audit(db, "create", "site", row["id"], body.name,
        description=f"Site created: {body.name}", new_data=dict(row),
        changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request))
    return dict(row)

@router.put("/api/v1/sites/{site_id}")
async def update_site(site_id: str, body: SiteIn, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    old_row = await db.fetchrow("SELECT * FROM sites WHERE id=$1::uuid", site_id)
    row = await db.fetchrow(
        "UPDATE sites SET name=$1,city=$2,region=$3,description=$4 WHERE id=$5::uuid RETURNING *",
        body.name, body.city, body.region, body.description, site_id
    )
    if not row: raise HTTPException(404, "Site not found")
    await cache_del("sites:list")
    await log_audit(db, "update", "site", site_id, body.name,
        description=f"Site updated: {body.name}",
        old_data=dict(old_row) if old_row else None, new_data=dict(row),
        changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request))
    return dict(row)

@router.delete("/api/v1/sites/{site_id}", status_code=204)
async def delete_site(site_id: str, request: Request, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    old_row = await db.fetchrow("SELECT * FROM sites WHERE id=$1::uuid", site_id)
    await db.execute("DELETE FROM sites WHERE id=$1::uuid", site_id)
    await cache_del("sites:list")
    if old_row:
        await log_audit(db, "delete", "site", site_id, old_row["name"],
            description=f"Site deleted: {old_row['name']}", old_data=dict(old_row),
            changed_by=current_user.get("username","admin"), ip_address=get_client_ip(request))
