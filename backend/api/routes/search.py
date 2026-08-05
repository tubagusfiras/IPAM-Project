from fastapi import APIRouter, Query, Depends

from core.database import get_db

router = APIRouter(tags=["Search"])


@router.get("/api/v1/search", summary="Global search")
async def global_search(q: str = Query(..., min_length=2), db=Depends(get_db)):
    results = {}
    results["blocks"]      = [dict(r) for r in await db.fetch("SELECT id, prefix::text AS label, name, description, ip_version FROM ip_blocks WHERE prefix::text ILIKE $1 OR name ILIKE $1 OR description ILIKE $1 LIMIT 5", f"%{q}%")]
    results["allocations"] = [dict(r) for r in await db.fetch("SELECT a.id, a.prefix::text AS label, a.customer_name, a.description, a.block_id, a.block_prefix, a.status, a.owner_type, a.vlan_vid, a.vlan_name, a.site_name FROM v_allocation_detail a WHERE a.prefix::text ILIKE $1 OR a.customer_name ILIKE $1 OR a.description ILIKE $1 OR a.vlan_name ILIKE $1 OR a.vlan_vid::text ILIKE $1 LIMIT 10", f"%{q}%")]
    results["customers"]   = [dict(r) for r in await db.fetch("SELECT c.id, c.name AS label, c.code, c.contact_email, COUNT(al.id) AS alloc_count FROM customers c LEFT JOIN allocations al ON al.customer_id=c.id WHERE c.name ILIKE $1 OR c.code ILIKE $1 GROUP BY c.id LIMIT 5", f"%{q}%")]
    results["vlans"]       = [dict(r) for r in await db.fetch("SELECT id, vid AS label, name, status FROM vlans WHERE vid::text ILIKE $1 OR name ILIKE $1 LIMIT 5", f"%{q}%")]
    return results
