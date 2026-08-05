import asyncio
import ipaddress
import json
import platform
from typing import Optional

import core.database
import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query, Depends, Request, BackgroundTasks
from fastapi.responses import StreamingResponse

from core.config import REDIS_URL
from core.database import get_db
from core.rate_limit import limiter
from services.ping_service import icmp_ping_batch, http_ping_via_worker, full_scan

router = APIRouter(tags=["Ping & Trace", "Global Ping"])

redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)


# ── Global Ping State ──
PING_SCHEDULER_LOCK = asyncio.Lock()
PING_IS_RUNNING = False
PING_LAST_SCAN = None
PING_PROGRESS = {"scanned": 0, "total": 0, "eta": None}
PING_CANCEL = False
PING_SOURCE = platform.node() or "ipam-server"


# ------------------------------------------------------------------
# PING & TRACE
# ------------------------------------------------------------------

def _validate_target(target: str) -> bool:
    """Basic validation untuk prevent command injection."""
    import re
    # Hanya allow IP address atau hostname yang valid
    pattern = r'^[a-zA-Z0-9.\-:]+$'
    return bool(re.match(pattern, target)) and len(target) < 256


async def _lookup_ipam(target: str, db) -> dict:
    """Cek apakah target IP terdaftar di IPAM."""
    try:
        ipaddress.ip_address(target)
    except ValueError:
        return None
    try:
        row = await db.fetchrow(
            """
            SELECT a.prefix::text, a.owner_type, a.status, c.name AS customer_name,
                   b.prefix::text AS block_prefix, b.name AS block_name, b.router, s.name AS site_name
            FROM allocations a
            JOIN ip_blocks b ON a.block_id = b.id
            LEFT JOIN customers c ON a.customer_id = c.id
            LEFT JOIN sites s ON b.site_id = s.id
            WHERE a.prefix >> $1::inet OR a.prefix = $1::inet
            LIMIT 1
            """, target
        )
        return dict(row) if row else None
    except Exception:
        return None


@router.get("/api/v1/ping-trace/lookup", summary="Lookup target in IPAM", tags=["Ping & Trace"])
async def lookup_target(target: str = Query(...), db=Depends(get_db)):
    """Cek apakah target ada di IPAM sebelum ping/trace."""
    if not _validate_target(target):
        raise HTTPException(400, "Invalid target format")
    info = await _lookup_ipam(target, db)
    return {"target": target, "ipam_info": info}


async def _stream_command(cmd: list):
    """Generator untuk streaming output command line by line via SSE."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode(errors="replace").rstrip()
            yield f"data: {json.dumps({'type':'line','text':text})}\n\n"
        await proc.wait()
        yield f"data: {json.dumps({'type':'done','returncode':proc.returncode})}\n\n"
    except asyncio.CancelledError:
        proc.kill()
        raise
    finally:
        if proc.returncode is None:
            try: proc.kill()
            except: pass


@router.get("/api/v1/ping-trace/ping", summary="Ping target (SSE stream)", tags=["Ping & Trace"])
@limiter.limit("10/minute")
async def stream_ping(request: Request, target: str = Query(...), count: int = Query(4, ge=1, le=20)):
    if not _validate_target(target):
        raise HTTPException(400, "Invalid target format")
    cmd = ["ping", "-c", str(count), target]
    return StreamingResponse(_stream_command(cmd), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/api/v1/ping-trace/traceroute", summary="Traceroute target (SSE stream)", tags=["Ping & Trace"])
@limiter.limit("5/minute")
async def stream_traceroute(request: Request, target: str = Query(...), max_hops: int = Query(30, ge=1, le=64)):
    if not _validate_target(target):
        raise HTTPException(400, "Invalid target format")
    cmd = ["traceroute", "-m", str(max_hops), "-w", "2", target]
    return StreamingResponse(_stream_command(cmd), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def _stream_mtr(target: str, max_hops: int, interval: float, dns_enabled: bool = True):
    """Stream MTR results as SSE, one JSON event per cycle."""
    cycle = 0
    while True:
        cmd = [
            "mtr", "--report-wide", "--json", "--show-ips",
            "--interval", str(interval),
            "--report-cycles", "1",
            "-m", str(max_hops),
            target
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            data = json.loads(stdout.decode(errors="replace"))
            hubs = data.get("report", {}).get("hubs", [])
            # extract IP dari format "hostname (IP)" via --show-ips
            import re
            for hub in hubs:
                h = hub.get("host","")
                paren_match = re.search(r'\(([\d.]+)\)', h)
                if paren_match:
                    hub["ip"] = paren_match.group(1)
                    hub["hostname"] = h.split(" (")[0].strip()
                else:
                    ip_only = re.search(r'\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b', h)
                    hub["ip"] = ip_only.group(1) if ip_only else None
                    hub["hostname"] = None
                if not dns_enabled:
                    hub["host"] = hub["ip"] or h
            cycle += 1
            payload = json.dumps({"type": "mtr", "cycle": cycle, "hubs": hubs})
            yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            raise
        except Exception as e:
            payload_err = json.dumps({"type": "error", "msg": str(e)})
            yield f"data: {payload_err}\n\n"

        await asyncio.sleep(interval)


@router.get("/api/v1/ping-trace/mtr", summary="MTR realtime (SSE stream)", tags=["Ping & Trace"])
@limiter.limit("3/minute")
async def stream_mtr(
    request: Request,
    target: str = Query(...),
    max_hops: int = Query(30, ge=1, le=64),
    interval: float = Query(2.0, ge=1.0, le=10.0),
    dns: bool = Query(True)
):
    if not _validate_target(target):
        raise HTTPException(400, "Invalid target format")
    return StreamingResponse(
        _stream_mtr(target, max_hops, interval, dns),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ============================================================
# GLOBAL PING VISIBILITY
# ============================================================

# ── Global Ping Scheduler ──
async def _ping_scheduler():
    """Auto-scan every 6 hours, plus retention cleanup"""
    global PING_IS_RUNNING
    while True:
        await asyncio.sleep(21600)  # 6 jam
        # Retention: keep ping_history for 30 days, and drop ping_results
        # rows whose IP no longer belongs to any active allocation.
        try:
            await core.database.pool.execute("DELETE FROM ping_history WHERE checked_at < NOW() - INTERVAL '30 days'")
            await core.database.pool.execute("""
                DELETE FROM ping_results pr
                WHERE NOT EXISTS (
                    SELECT 1 FROM allocations a
                    WHERE a.status = 'active' AND pr.ip::inet <<= a.prefix::cidr
                )
            """)
        except Exception:
            pass
        if PING_IS_RUNNING:
            continue
        try:
            rows = await core.database.pool.fetch("SELECT DISTINCT prefix::text FROM allocations WHERE status='active' AND prefix::text NOT LIKE '%:%'")
            import ipaddress
            ips = []
            for r in rows:
                try:
                    net = ipaddress.ip_network(r['prefix'], strict=False)
                    host = str(net.network_address + 1)
                    if host not in ips: ips.append(host)
                except:
                    pass
            if ips:
                PING_IS_RUNNING = True
                PING_PROGRESS = {"scanned": 0, "total": len(ips), "eta": None}
                asyncio.create_task(_run_scan_and_save_with_pool(ips))
        except:
            pass


@router.get("/api/v1/ping/status", summary="Global Ping — latest scan results", tags=["Global Ping"])
async def get_ping_status(
    status: Optional[str] = Query(None, regex="^(online|offline|error|pending|all)$"),
    search: Optional[str] = Query(None),
    sort_by: str = Query("scanned_at", regex="^(ip|icmp_status|http_status|customer_name|scanned_at|icmp_rtt)$"),
    sort_dir: str = Query("DESC", regex="^(ASC|DESC)$"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db=Depends(get_db)
):
    """Get latest ping results, filter by status and search IP"""
    global PING_IS_RUNNING, PING_LAST_SCAN, PING_PROGRESS

    if PING_IS_RUNNING and PING_PROGRESS.get("scanned", 0) == 0:
        try:
            stored = await redis_client.get("ping:progress")
            if stored:
                import json as _json
                PING_PROGRESS = _json.loads(stored)
        except: pass

    params = []
    conditions = ["al.status = 'active'", "family(al.prefix) = 4", "masklen(al.prefix) >= 24"]
    if status and status != "all":
        if status == "pending":
            conditions.append("(pr.icmp_status IS NULL OR pr.scanned_at < NOW() - INTERVAL '1 day')")
        else:
            params.append(status)
            conditions.append(f"COALESCE(pr.icmp_status, 'pending') = CAST(${len(params)} AS text)")

    if search:
        params.append(f"%{search}%")
        conditions.append(f"(host((al.prefix::cidr - 1 + 2))::text ILIKE CAST(${len(params)} AS text) OR al.prefix::text ILIKE CAST(${len(params)} AS text) OR c.name ILIKE CAST(${len(params)} AS text) OR b.name ILIKE CAST(${len(params)} AS text))")

    where = " AND ".join(conditions)
    sort_map = {
        "ip": "host_ip",
        "icmp_status": "icmp_status",
        "http_status": "http_status",
        "customer_name": "c_name",
        "scanned_at": "pr.scanned_at",
        "icmp_rtt": "pr.icmp_rtt",
    }
    order_col = sort_map.get(sort_by, "host_ip")
    order_nulls = " NULLS LAST" if order_col in ("pr.scanned_at", "pr.icmp_rtt") else ""
    query = f"""
        SELECT host_ip, pr.icmp_status, pr.icmp_rtt, pr.icmp_at, pr.http_status, pr.http_rtt, pr.http_at,
            pr.scanned_at,
            c.name AS customer_name, b.name AS block_name, s.name AS site_name,
            al.prefix::text AS alloc_prefix, al.status AS alloc_status,
            (CASE WHEN b.prefix IS NOT NULL THEN
                (CASE WHEN family(b.prefix) = 4 THEN power(2, 32 - masklen(b.prefix))::int
                      ELSE power(2, 128 - masklen(b.prefix))::bigint END)
            ELSE NULL END) AS block_total_ips,
            (SELECT COUNT(*) FROM ping_region_details prd WHERE prd.ip = host_ip AND prd.status = 'online') as regions_online,
            (SELECT COUNT(*) FROM ping_region_details prd WHERE prd.ip = host_ip) as regions_total
        FROM (
            SELECT DISTINCT ON (al.id)
                host((al.prefix::cidr - 1 + 2))::inet AS host_ip,
                al.id AS alloc_id, al.block_id
            FROM allocations al
            WHERE al.status = 'active' AND family(al.prefix) = 4 AND masklen(al.prefix) >= 24
        ) sub
        JOIN allocations al ON al.id = sub.alloc_id
        LEFT JOIN ip_blocks b ON al.block_id = b.id
        LEFT JOIN sites s ON b.site_id = s.id
        LEFT JOIN customers c ON al.customer_id = c.id
        LEFT JOIN ping_results pr ON pr.ip = sub.host_ip
        WHERE {where}
        ORDER BY 
            (SELECT COUNT(*) FROM ping_region_details prd WHERE prd.ip = host_ip) DESC,
            {order_col} {sort_dir}{order_nulls} 
        LIMIT ${len(params)+1} OFFSET ${len(params)+2}
    """
    rows = await db.fetch(query, *params, limit, offset)
    total = await db.fetchval(f"""
        SELECT COUNT(*) FROM (
            SELECT DISTINCT ON (al.id) al.id AS alloc_id
            FROM allocations al
            LEFT JOIN ping_results pr ON pr.ip = host((al.prefix::cidr - 1 + 2))::inet
            LEFT JOIN ip_blocks b ON al.block_id = b.id
            LEFT JOIN customers c ON al.customer_id = c.id
            WHERE {where}
        ) cnt
    """, *params)

    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "running": PING_IS_RUNNING,
        "last_scan": PING_LAST_SCAN,
        "scan_progress": PING_PROGRESS if PING_IS_RUNNING else None,
        "limit": limit,
        "offset": offset,
    }


@router.post("/api/v1/ping/run", summary="Global Ping — trigger scan semua active IP", tags=["Global Ping"])
@limiter.limit("2/minute")
async def run_ping_scan(
    request: Request,
    background_tasks: BackgroundTasks,
    target_ip: Optional[str] = Query(None, description="Scan specific IP only (optional)"),
    db=Depends(get_db)
):
    """Trigger ping scan untuk semua active allocations"""
    global PING_IS_RUNNING

    if PING_IS_RUNNING:
        raise HTTPException(429, "Scan already in progress")

    PING_IS_RUNNING = True

    # Ambil semua prefix active dari DB
    if target_ip:
        rows = await db.fetch("SELECT prefix::text, block_id FROM allocations WHERE prefix::text LIKE $1 AND status = 'active' LIMIT 1", f"{target_ip}%")
    else:
        rows = await db.fetch("SELECT DISTINCT prefix::text, block_id FROM allocations WHERE status = 'active' AND prefix::text NOT LIKE '%:%'")

    # Parse IP host (first usable host per prefix)
    import ipaddress
    ips = []
    for r in rows:
        try:
            net = ipaddress.ip_network(r["prefix"], strict=False)
            first_host = str(net.network_address + 1)
            if first_host not in ips:
                ips.append(first_host)
        except:
            ip = r["prefix"].split("/")[0]
            if ip not in ips:
                ips.append(ip)

    if not ips:
        PING_IS_RUNNING = False
        return {"status": "no_active_ips", "total": 0}

    # Set progress awal segera
    PING_PROGRESS = {"scanned": 0, "total": len(ips), "eta": None}
    global PING_CANCEL
    PING_CANCEL = False
    try:
        await redis_client.set("ping:progress", json.dumps(PING_PROGRESS, default=str), ex=3600)
    except: pass

    # Jalankan scan di background — pakai connection pool baru
    pool_copy = core.database.pool  # Ambil pool dari module scope
    background_tasks.add_task(_run_scan_and_save_with_pool, ips)

    return {"status": "started", "total": len(ips), "message": f"Scanning {len(ips)} IPs in background"}


@router.post("/api/v1/ping/cancel", summary="Global Ping — cancel running scan", tags=["Global Ping"])
async def cancel_ping_scan():
    """Cancel scan yang sedang berjalan"""
    global PING_CANCEL, PING_IS_RUNNING
    if not PING_IS_RUNNING:
        return {"status": "no_scan_running"}
    PING_CANCEL = True
    return {"status": "cancelling"}


@router.get("/api/v1/ping/history/{ip}", summary="Global Ping — history IP", tags=["Global Ping"])
async def get_ping_history(ip: str, days: int = Query(7, ge=1, le=90), db=Depends(get_db)):
    """Get ping history untuk specific IP"""
    rows = await db.fetch("""
        SELECT * FROM ping_history
        WHERE ip = $1::inet AND checked_at > NOW() - INTERVAL '1 day' * $2
        ORDER BY checked_at DESC LIMIT 500
    """, ip, days)
    return {"items": [dict(r) for r in rows]}


@router.get("/api/v1/ping/active-ips", summary="Global Ping — list active IPs for agents", tags=["Global Ping"])
async def get_active_ips(db=Depends(get_db)):
    """Return list of active allocation IPs for remote agents to ping.
    Used by Oracle Cloud SG/US agents to know which IPs to check."""
    rows = await db.fetch("""
        SELECT ip, block_name, site_name FROM (
            SELECT DISTINCT a.prefix::text AS ip, b.name AS block_name, s.name AS site_name
            FROM allocations a
            JOIN ip_blocks b ON a.block_id = b.id
            LEFT JOIN sites s ON b.site_id = s.id
            WHERE a.status = 'active'
        ) sub
        ORDER BY ip
    """)
    return {"items": [dict(r) for r in rows], "total": len(rows)}


async def _run_scan_and_save_with_pool(ips: list[str]):
    """Background task: scan + save + update history — pakai pool sendiri"""
    global PING_IS_RUNNING, PING_LAST_SCAN, PING_PROGRESS, PING_CANCEL
    import time
    from datetime import datetime, timezone

    PING_PROGRESS = {"scanned": 0, "total": len(ips), "eta": None}
    start_time = time.monotonic()

    async with core.database.pool.acquire() as db:
        results = []
        try:
            batch_size = 50
            for i in range(0, len(ips), batch_size):
                if PING_CANCEL:
                    break
                batch = ips[i:i + batch_size]
                icmp = await icmp_ping_batch(batch)

                for r in icmp:
                    ip = r["ip"]
                    status = r["status"]
                    rtt = r.get("rtt_ms")
                    http_result = await http_ping_via_worker(ip)
                    http_status = http_result.get("status", "error")
                    http_rtt = http_result.get("rtt_ms")

                    alloc = await db.fetchrow("""
                        SELECT c.name AS c_name, b.name AS b_name, s.name AS s_name
                        FROM allocations a
                        LEFT JOIN customers c ON a.customer_id = c.id
                        LEFT JOIN ip_blocks b ON a.block_id = b.id
                        LEFT JOIN sites s ON b.site_id = s.id
                        WHERE a.status = 'active' AND $1::inet <<= a.prefix::cidr
                        LIMIT 1
                    """, ip)
                    cust_name = alloc["c_name"] if alloc else None
                    blk_name = alloc["b_name"] if alloc else None
                    sit_name = alloc["s_name"] if alloc else None

                    await db.execute("""
                        INSERT INTO ping_results (ip, prefix, icmp_status, icmp_rtt, icmp_at, http_status, http_rtt, http_at, scanned_at, customer_name, block_name, site_name)
                        VALUES ($1::inet, (split_part($1::text, '/', 1) || '/32')::cidr, $2, $3, NOW(), $4, $5, NOW(), NOW(), $6, $7, $8)
                        ON CONFLICT (ip) DO UPDATE SET icmp_status=$2, icmp_rtt=$3, icmp_at=NOW(), http_status=$4, http_rtt=$5, http_at=NOW(), scanned_at=NOW(), customer_name=$6, block_name=$7, site_name=$8
                    """, ip, status, rtt, http_status, http_rtt, cust_name, blk_name, sit_name)

                    await db.execute("""
                        INSERT INTO ping_history (ip, status, source, checked_at)
                        VALUES ($1::inet, $2, 'icmp_local', NOW())
                    """, ip, status)

                    if http_status == "online":
                        await db.execute("""
                            INSERT INTO ping_history (ip, status, source, checked_at)
                            VALUES ($1::inet, 'online', 'http_global', NOW())
                        """, ip)

                    results.append(r)

                scanned = min(i + batch_size, len(ips))
                elapsed = time.monotonic() - start_time
                rate = scanned / elapsed if elapsed > 0 else 0
                eta = int((len(ips) - scanned) / rate) if rate > 0 else None
                PING_PROGRESS = {"scanned": scanned, "total": len(ips), "eta": eta}
                try:
                    await redis_client.set("ping:progress", json.dumps(PING_PROGRESS, default=str), ex=3600)
                except: pass

        except Exception as e:
            print(f"[PingScan] Error: {e}")
            import traceback
            traceback.print_exc()

        # ── Phase 2: check-host.net region data untuk IP online ──
        try:
            online_ips = [r["ip"] for r in results if r.get("status") == "online"]
            if online_ips:
                # Filter: hanya IP yang belum punya region data atau data > 6 jam
                need_refresh = await db.fetch("""
                    SELECT ip FROM ping_region_details
                    WHERE ip = ANY($1::inet[])
                    GROUP BY ip
                    HAVING MAX(checked_at) > NOW() - INTERVAL '6 hours'
                """, online_ips)
                fresh_ips = {str(r["ip"]) for r in need_refresh}
                to_fetch = [ip for ip in online_ips if ip not in fresh_ips][:100]

                if to_fetch:
                    print(f"[PingScan] check-host.net: fetching region data untuk {len(to_fetch)} IPs (dari {len(online_ips)} online)...")
                    from services.ping_service import check_host_ping
                    _ch_results_ok = 0
                    _ch_results_fail = 0

                    for ip in to_fetch:
                        if PING_CANCEL:
                            break
                        try:
                            ch_result = await check_host_ping(ip, timeout=15)
                            regions = ch_result.get("regions", [])
                            if regions:
                                for reg in regions:
                                    cc = reg.get("country_code", "??").lower()
                                    cn = reg.get("country_name", cc)
                                    st = reg.get("status", "unknown")
                                    await db.execute("""
                                        INSERT INTO ping_region_details (ip, country_code, country_name, status, checked_at)
                                        VALUES ($1::inet, $2, $3, $4, NOW())
                                        ON CONFLICT (ip, country_code) DO UPDATE SET status=$4, country_name=$3, checked_at=NOW()
                                    """, ip, cc, cn, st)
                                _ch_results_ok += 1
                            else:
                                _ch_results_fail += 1
                        except Exception as e2:
                            _ch_results_fail += 1
                            print(f"[PingScan] check-host.net error {ip}: {e2}")

                    print(f"[PingScan] check-host.net selesai: {_ch_results_ok} OK, {_ch_results_fail} fail")
                else:
                    print(f"[PingScan] check-host.net: semua {len(fresh_ips)} IPs sudah punya region data recent")
        except Exception as e:
            print(f"[PingScan] check-host.net phase error: {e}")

        try:
            PING_LAST_SCAN = datetime.now(timezone.utc).isoformat()
        except: pass
        finally:
            PING_IS_RUNNING = False
            PING_CANCEL = False
            PING_PROGRESS = {"scanned": 0, "total": 0, "eta": None}
            try:
                await redis_client.delete("ping:progress")
            except: pass


COUNTRY_NAMES = {
    "sg":"Singapore","jp":"Japan","hk":"Hong Kong","tw":"Taiwan","kr":"South Korea",
    "id":"Indonesia","my":"Malaysia","th":"Thailand","ph":"Philippines","vn":"Vietnam",
    "in":"India","au":"Australia","nz":"New Zealand","us":"United States","ca":"Canada",
    "gb":"United Kingdom","de":"Germany","fr":"France","nl":"Netherlands","it":"Italy",
    "es":"Spain","pt":"Portugal","se":"Sweden","no":"Norway","fi":"Finland","dk":"Denmark",
    "pl":"Poland","cz":"Czech Republic","at":"Austria","ch":"Switzerland","be":"Belgium",
    "ie":"Ireland","ru":"Russia","ua":"Ukraine","tr":"Turkey","il":"Israel","ae":"UAE",
    "sa":"Saudi Arabia","br":"Brazil","mx":"Mexico","ar":"Argentina","cl":"Chile",
    "co":"Colombia","za":"South Africa","eg":"Egypt","ng":"Nigeria","ke":"Kenya",
    "ir":"Iran","pk":"Pakistan","bd":"Bangladesh","lk":"Sri Lanka","np":"Nepal",
    "ro":"Romania","bg":"Bulgaria","hr":"Croatia","rs":"Serbia","hu":"Hungary",
    "sk":"Slovakia","si":"Slovenia","lt":"Lithuania","lv":"Latvia","ee":"Estonia",
    "md":"Moldova","by":"Belarus","cy":"Cyprus","mt":"Malta","lu":"Luxembourg","is":"Iceland",
}


@router.post("/api/v1/ping/report", summary="Global Ping — receive agent report", tags=["Global Ping"])
async def receive_ping_report(body: dict, db=Depends(get_db)):
    """Receive ping results from agents.
    Body: { "results": [{"ip": "x.x.x.x", "status": "online", "rtt_ms": 12.3}],
            "source": "icmp_local"|"http_global",
            "region_details": {"sg":"online","us":"offline",...} }
    """
    results = body.get("results", [])
    region_details = body.get("region_details", {})

    pfx = "(split_part($1::text, '/', 1) || '/32')::cidr"

    all_ips = []
    for r in results:
        ip_raw = r.get("ip", "")
        if ip_raw:
            all_ips.append(ip_raw.split("/")[0] if "/" in ip_raw else ip_raw)
    alloc_map = {}
    if all_ips:
        placeholders = ", ".join(f"${i+1}" for i in range(len(all_ips)))
        alloc_rows = await db.fetch(f"""
            SELECT DISTINCT ON (pr2.ip) pr2.ip,
                COALESCE(c.name, '') AS c_name,
                COALESCE(b.name, '') AS b_name,
                COALESCE(s.name, '') AS s_name,
                b.prefix::text AS block_prefix
            FROM (SELECT unnest(ARRAY[{placeholders}])::inet AS ip) pr2
            JOIN allocations a ON pr2.ip <<= a.prefix::cidr AND a.status = 'active'
            LEFT JOIN customers c ON a.customer_id = c.id
            LEFT JOIN ip_blocks b ON a.block_id = b.id
            LEFT JOIN sites s ON b.site_id = s.id
        """, *all_ips)
        for ar in alloc_rows:
            alloc_map[str(ar["ip"])] = ar

    updated = 0
    for r in results:
        ip_raw = r.get("ip", "")
        status = r.get("status")
        rtt = r.get("rtt_ms")
        if not ip_raw or not status:
            continue
        ip = ip_raw.split("/")[0] if "/" in ip_raw else ip_raw
        alloc = alloc_map.get(ip)
        c_name = alloc["c_name"] if alloc else None
        b_name = alloc["b_name"] if alloc else None
        s_name = alloc["s_name"] if alloc else None

        await db.execute(f"""
            INSERT INTO ping_results (ip, prefix, icmp_status, icmp_rtt, icmp_at, scanned_at, customer_name, block_name, site_name)
            VALUES ($1::inet, {pfx}, $2, $3, NOW(), NOW(), $4, $5, $6)
            ON CONFLICT (ip) DO UPDATE SET icmp_status=$2, icmp_rtt=$3, icmp_at=NOW(), scanned_at=NOW(),
                customer_name = COALESCE(EXCLUDED.customer_name, ping_results.customer_name),
                block_name = COALESCE(EXCLUDED.block_name, ping_results.block_name),
                site_name = COALESCE(EXCLUDED.site_name, ping_results.site_name)
        """, ip, status, rtt, c_name, b_name, s_name)

        await db.execute(
            "INSERT INTO ping_history (ip, status, source) VALUES ($1::inet, $2, $3)",
            ip, status, body.get("source", "agent"))
        updated += 1

    # Region details (check-host.net per-country results)
    if region_details and results:
        first_ip = results[0].get("ip", "").split("/")[0]
        if first_ip:
            for cc, c_status in region_details.items():
                await db.execute("""
                    INSERT INTO ping_region_details (ip, country_code, country_name, status, checked_at)
                    VALUES ($1::inet, $2, $3, $4, NOW())
                    ON CONFLICT (ip, country_code) DO UPDATE SET status = $4, checked_at = NOW()
                """, first_ip, cc, COUNTRY_NAMES.get(cc, cc.upper()), c_status)

    return {"received": len(results), "updated": updated, "source": body.get("source", "agent")}


@router.get("/api/v1/ping/summary", summary="Global Ping — summary dashboard", tags=["Global Ping"])
async def get_ping_summary(db=Depends(get_db)):
    """Quick summary counts for dashboard widget"""
    total = await db.fetchval("SELECT COUNT(*) FROM allocations WHERE status = 'active' AND family(prefix) = 4 AND masklen(prefix) >= 24")
    # Count by status from ping_results (only recently scanned)
    latest = await db.fetch("""
        SELECT icmp_status, COUNT(*) as cnt FROM ping_results
        WHERE scanned_at > NOW() - INTERVAL '1 day'
        GROUP BY icmp_status
    """)
    counts = {r["icmp_status"]: r["cnt"] for r in latest}
    online = counts.get("online", 0)
    offline = counts.get("offline", 0)
    scanned = online + offline
    pending = total - scanned if total > scanned else 0
    return {
        "total_active_ips": total,
        "online": online,
        "offline": offline,
        "pending": pending,
    }


@router.get("/api/v1/ping/region-details/{ip}", summary="Global Ping — region details for one IP", tags=["Global Ping"])
async def get_ping_region_details(ip: str, force: bool = Query(False), db=Depends(get_db)):
    """Return per-country check-host.net results for a specific IP.
    If force=true or data is stale (>1 hour), re-fetch from check-host.net."""
    # Check if we have fresh data
    if not force:
        rows = await db.fetch("""
            SELECT country_code, country_name, status, checked_at
            FROM ping_region_details
            WHERE ip = $1::inet AND checked_at > NOW() - INTERVAL '1 hour'
            ORDER BY country_code
        """, ip)
        if rows:
            return {"ip": ip, "regions": [dict(r) for r in rows], "source": "cache"}

    # Fetch fresh data from check-host.net
    from services.ping_service import check_host_ping
    result = await check_host_ping(ip)

    if result.get("regions"):
        # Save to DB
        async with db.transaction():
            await db.execute("DELETE FROM ping_region_details WHERE ip = $1::inet", ip)
            for r in result["regions"]:
                await db.execute("""
                    INSERT INTO ping_region_details (ip, country_code, country_name, status, checked_at)
                    VALUES ($1::inet, $2, $3, $4, NOW())
                    ON CONFLICT (ip, country_code) DO UPDATE SET
                        country_name = EXCLUDED.country_name,
                        status = EXCLUDED.status,
                        checked_at = EXCLUDED.checked_at
                """, ip, r["country_code"], r["country_name"], r["status"])

    rows = await db.fetch("""
        SELECT country_code, country_name, status, checked_at
        FROM ping_region_details
        WHERE ip = $1::inet
        ORDER BY country_code
    """, ip)
    return {"ip": ip, "regions": [dict(r) for r in rows], "source": "check-host.net"}
