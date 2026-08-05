import asyncio
import ipaddress
import json
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from loguru import logger

from core.audit import log_audit, get_client_ip
from core.config import REDIS_URL, SCAN_TTL
from core.database import get_db
from core.rate_limit import limiter
from core.security import get_current_user

router = APIRouter(tags=["IP Scan"])

redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)

# Active scan sessions: scan_id -> {status, results, progress}
_scan_sessions: dict = {}


async def _ping_host(ip: str, timeout: float = 1.0) -> bool:
    """Ping single host, return True if responds."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", str(int(timeout)), "-q", str(ip),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=timeout + 0.5)
        return proc.returncode == 0
    except Exception:
        return False


async def _tcp_probe(ip: str, ports=(22, 80, 443, 23), timeout: float = 1.0) -> bool:
    """Try TCP connect to common ports, return True if any responds."""
    for port in ports:
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=timeout
            )
            writer.close()
            try: await writer.wait_closed()
            except: pass
            return True
        except Exception:
            continue
    return False


async def _scan_ip(ip: str) -> dict:
    """Scan single IP using ping + TCP fallback."""
    ping_ok = await _ping_host(ip, timeout=1.0)
    if ping_ok:
        return {"ip": ip, "responding": True, "method": "icmp"}
    tcp_ok = await _tcp_probe(ip, timeout=0.8)
    if tcp_ok:
        return {"ip": ip, "responding": True, "method": "tcp"}
    return {"ip": ip, "responding": False, "method": "none"}


async def _save_scan_to_redis(scan_id: str):
    """Persist scan session ke Redis agar survive API restart."""
    try:
        session = _scan_sessions.get(scan_id)
        if session:
            await redis_client.set(f"scan:{scan_id}", json.dumps(session, default=str), ex=SCAN_TTL)
    except Exception as e:
        logger.error("Redis save error: {}", e)


async def _load_scan_from_redis(scan_id: str) -> dict | None:
    """Load scan session dari Redis jika tidak ada di memory (misal setelah API restart)."""
    try:
        data = await redis_client.get(f"scan:{scan_id}")
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error("Redis load error: {}", e)
    return None


async def _delete_scan_from_redis(scan_id: str):
    try:
        await redis_client.delete(f"scan:{scan_id}")
    except Exception as e:
        logger.error("Redis delete error: {}", e)


@router.post("/api/v1/scan/start", summary="Start IP scan for a block", tags=["IP Scan"])
@limiter.limit("3/minute")
async def start_scan(request: Request, body: dict, db=Depends(get_db)):
    """Start background scan for a block."""
    block_id = body.get("block_id")
    if not block_id:
        raise HTTPException(400, "block_id required")

    row = await db.fetchrow("SELECT id, prefix::text, ip_version FROM ip_blocks WHERE id=$1::uuid", block_id)
    if not row:
        raise HTTPException(404, "Block not found")
    if row["ip_version"] != "IPv4":
        raise HTTPException(400, "IP Scan only supports IPv4")

    scan_id = f"{block_id}"

    # Jika sudah ada scan running untuk block ini, return existing
    if scan_id in _scan_sessions and _scan_sessions[scan_id]["status"] == "running":
        return {"scan_id": scan_id, "status": "already_running"}

    # Fetch existing allocations untuk comparison
    allocs = await db.fetch(
        "SELECT a.prefix::text, a.id, a.owner_type, a.status, c.name AS customer_name "
        "FROM allocations a LEFT JOIN customers c ON a.customer_id=c.id "
        "WHERE a.block_id=$1::uuid", block_id
    )
    alloc_map = {}
    for a in allocs:
        alloc_map[a["prefix"]] = dict(a)

    # Generate list IPs to scan
    network = ipaddress.ip_network(row["prefix"], strict=False)
    # Skip network address dan broadcast
    hosts = [str(ip) for ip in network.hosts()]
    total = len(hosts)

    # Init session
    _scan_sessions[scan_id] = {
        "status": "running",
        "block_id": block_id,
        "prefix": row["prefix"],
        "total": total,
        "scanned": 0,
        "started_at": time.time(),
        "results": [],
        "alloc_map": alloc_map,
    }

    # Run scan in background
    async def run_scan():
        session = _scan_sessions[scan_id]
        try:
            BATCH = 32  # parallel workers
            for i in range(0, total, BATCH):
                if session["status"] == "cancelled":
                    break
                batch = hosts[i:i+BATCH]
                tasks = [_scan_ip(ip) for ip in batch]
                results = await asyncio.gather(*tasks)
                for r in results:
                    ip = r["ip"]
                    responding = r["responding"]
                    method = r["method"]
                    # Find matching allocation (exact /32 or subnet containing this IP)
                    alloc = None
                    ip_obj = ipaddress.ip_address(ip)
                    for prefix, a in alloc_map.items():
                        try:
                            if ip_obj in ipaddress.ip_network(prefix, strict=False):
                                alloc = a
                                break
                        except: pass

                    discrepancy = None
                    if responding and not alloc:
                        discrepancy = "unregistered"  # Respond tapi tidak di IPAM
                    elif not responding and alloc and alloc["status"] == "active":
                        discrepancy = "ghost"  # Di IPAM tapi tidak respond

                    session["results"].append({
                        "ip": ip,
                        "responding": responding,
                        "method": method,
                        "alloc_prefix": alloc["prefix"] if alloc else None,
                        "alloc_id": alloc["id"] if alloc else None,
                        "owner_type": alloc["owner_type"] if alloc else None,
                        "customer_name": alloc["customer_name"] if alloc else None,
                        "alloc_status": alloc["status"] if alloc else None,
                        "discrepancy": discrepancy,
                    })
                session["scanned"] = min(i + BATCH, total)
                await _save_scan_to_redis(scan_id)
            session["status"] = "done"
            session["finished_at"] = time.time()
            await _save_scan_to_redis(scan_id)
        except Exception as e:
            session["status"] = "failed"
            session["error"] = str(e)
            session["finished_at"] = time.time()
            await _save_scan_to_redis(scan_id)

    asyncio.create_task(run_scan())
    await _save_scan_to_redis(scan_id)
    return {"scan_id": scan_id, "status": "started", "total": total}


@router.get("/api/v1/scan/status/{scan_id}", summary="Get scan progress + results", tags=["IP Scan"])
async def scan_status(scan_id: str):
    """Get current scan progress and results."""
    if scan_id not in _scan_sessions:
        # Fallback: coba load dari Redis (misal setelah API restart)
        restored = await _load_scan_from_redis(scan_id)
        if not restored:
            raise HTTPException(404, "Scan session not found")
        # Jika scan dulunya "running" tapi API sudah restart, tandai sebagai interrupted
        if restored.get("status") == "running":
            restored["status"] = "interrupted"
        _scan_sessions[scan_id] = restored
    s = _scan_sessions[scan_id]
    elapsed = time.time() - s["started_at"]
    scanned = s["scanned"]
    total = s["total"]
    pct = round(scanned / total * 100, 1) if total else 0
    eta = None
    if scanned > 0 and s["status"] == "running":
        rate = scanned / elapsed
        remaining = total - scanned
        eta = round(remaining / rate) if rate > 0 else None

    results = s["results"]
    responding = [r for r in results if r["responding"]]
    unregistered = [r for r in results if r["discrepancy"] == "unregistered"]

    # Ghost logic: per-prefix, bukan per-IP
    # Suatu alokasi dianggap ghost jika TIDAK ADA SATUPUN IP dalam prefix-nya yang respond
    alloc_map = s.get("alloc_map", {})
    ghost_allocs = []
    if s["status"] == "done":
        # Kumpulkan IP yang respond per alloc_prefix
        responding_per_alloc = {}
        for r in results:
            if r["responding"] and r["alloc_prefix"]:
                responding_per_alloc.setdefault(r["alloc_prefix"], []).append(r["ip"])

        for prefix, alloc in alloc_map.items():
            if alloc["status"] != "active":
                continue
            has_responding = prefix in responding_per_alloc
            if not has_responding:
                ghost_allocs.append({
                    "alloc_prefix": prefix,
                    "alloc_id": alloc["id"],
                    "owner_type": alloc["owner_type"],
                    "customer_name": alloc["customer_name"],
                    "alloc_status": alloc["status"],
                })

    return {
        "scan_id": scan_id,
        "status": s["status"],
        "prefix": s["prefix"],
        "total": total,
        "scanned": scanned,
        "pct": pct,
        "elapsed": round(elapsed),
        "eta_seconds": eta,
        "responding_count": len(responding),
        "ghost_count": len(ghost_allocs),
        "unregistered_count": len(unregistered),
        "ghost_allocs": ghost_allocs,      # per-prefix ghost allocations
        "unregistered_ips": unregistered,  # IPs responding tapi tidak di IPAM
        "results": results,
    }


@router.post("/api/v1/scan/cancel/{scan_id}", summary="Cancel ongoing scan", tags=["IP Scan"])
async def cancel_scan(scan_id: str):
    """Cancel ongoing scan."""
    if scan_id not in _scan_sessions:
        raise HTTPException(404, "Scan session not found")
    _scan_sessions[scan_id]["status"] = "cancelled"
    await _save_scan_to_redis(scan_id)
    return {"status": "cancelled"}


@router.delete("/api/v1/scan/clear/{scan_id}", summary="Clear scan session", tags=["IP Scan"])
async def clear_scan(scan_id: str):
    """Clear scan session."""
    if scan_id in _scan_sessions:
        del _scan_sessions[scan_id]
    await _delete_scan_from_redis(scan_id)
    return {"status": "cleared"}


@router.post("/api/v1/scan/action", summary="Take action on scan result", tags=["IP Scan"])
@limiter.limit("10/minute")
async def scan_action(request: Request, body: dict, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Perform action on scan result — mark or delete allocation."""
    action = body.get("action")  # "delete" | "mark_deprecated"
    alloc_id = body.get("alloc_id")
    if not alloc_id:
        raise HTTPException(400, "alloc_id required")

    # Fetch existing data untuk audit log
    existing = await db.fetchrow(
        "SELECT a.*, c.name AS customer_name FROM allocations a "
        "LEFT JOIN customers c ON a.customer_id=c.id WHERE a.id=$1::uuid", alloc_id
    )
    if not existing:
        raise HTTPException(404, "Allocation not found")
    old_data = dict(existing)
    prefix = old_data.get("prefix")
    ip_addr = get_client_ip(request)
    cust_id = str(old_data["customer_id"]) if old_data.get("customer_id") else None

    if action == "delete":
        await db.execute("DELETE FROM allocations WHERE id=$1::uuid", alloc_id)
        await log_audit(db, "delete", "allocation", alloc_id, str(prefix),
                          description=f"Deleted via IP Scan — ghost allocation ({old_data.get('customer_name') or old_data.get('owner_type')})",
                          old_data=old_data, changed_by=current_user.get("username","admin"),
                          ip_address=ip_addr, customer_id=cust_id)
        return {"status": "deleted"}
    elif action == "mark_deprecated":
        await db.execute("UPDATE allocations SET status='deprecated' WHERE id=$1::uuid", alloc_id)
        await log_audit(db, "update", "allocation", alloc_id, str(prefix),
                          description=f"Marked deprecated via IP Scan ({old_data.get('customer_name') or old_data.get('owner_type')})",
                          old_data=old_data, new_data={**old_data, "status": "deprecated"},
                          changed_by=current_user.get("username","admin"),
                          ip_address=ip_addr, customer_id=cust_id)
        return {"status": "marked_deprecated"}
    else:
        raise HTTPException(400, "Invalid action")


@router.get("/api/v1/audit-logs", summary="List audit logs", tags=["Audit"])
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    changed_by: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    vlan_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="ISO date, inclusive"),
    date_to: Optional[str] = Query(None, description="ISO date, inclusive"),
    search: Optional[str] = Query(None, description="Search entity_prefix/description"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db=Depends(get_db)
):
    conditions, params = ["1=1"], []
    if entity_type:
        params.append(entity_type)
        conditions.append(f"entity_type = ${len(params)}")
    if action:
        params.append(action)
        conditions.append(f"action = ${len(params)}")
    if changed_by:
        params.append(changed_by)
        conditions.append(f"changed_by = ${len(params)}")
    if customer_id:
        params.append(customer_id)
        conditions.append(f"customer_id = ${len(params)}::uuid")
    if vlan_id:
        params.append(vlan_id)
        conditions.append(f"vlan_id = ${len(params)}::uuid")
    if date_from:
        params.append(date_from)
        conditions.append(f"created_at >= ${len(params)}::date")
    if date_to:
        params.append(date_to)
        conditions.append(f"created_at < (${len(params)}::date + interval '1 day')")
    if search:
        params.append(f"%{search}%")
        conditions.append(f"(entity_prefix ILIKE ${len(params)} OR description ILIKE ${len(params)})")
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(
        f"SELECT * FROM audit_logs WHERE {where} ORDER BY created_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}",
        *params
    )
    total = await db.fetchval(f"SELECT COUNT(*) FROM audit_logs WHERE {where}", *params[:-2])
    distinct_users = await db.fetch("SELECT DISTINCT changed_by FROM audit_logs WHERE changed_by IS NOT NULL ORDER BY changed_by")
    items = []
    for r in rows:
        item = dict(r)
        if item.get("old_data") and isinstance(item["old_data"], str):
            item["old_data"] = json.loads(item["old_data"])
        if item.get("new_data") and isinstance(item["new_data"], str):
            item["new_data"] = json.loads(item["new_data"])
        items.append(item)
    return {"total": total, "items": items, "users": [r["changed_by"] for r in distinct_users]}
