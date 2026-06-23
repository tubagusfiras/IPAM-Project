from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from models.schemas import SiteIn
from core.database import get_db
from core.cache import cache_get, cache_set, cache_del

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
async def create_site(body: SiteIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "INSERT INTO sites (name,city,region,description) VALUES ($1,$2,$3,$4) RETURNING *",
        body.name, body.city, body.region, body.description
    )
    await cache_del("sites:list")
    return dict(row)

@router.put("/api/v1/sites/{site_id}")
async def update_site(site_id: str, body: SiteIn, db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE sites SET name=$1,city=$2,region=$3,description=$4 WHERE id=$5::uuid RETURNING *",
        body.name, body.city, body.region, body.description, site_id
    )
    if not row: raise HTTPException(404, "Site not found")
    await cache_del("sites:list")
    return dict(row)

@router.delete("/api/v1/sites/{site_id}", status_code=204)
async def delete_site(site_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM sites WHERE id=$1::uuid", site_id)
    await cache_del("sites:list")
