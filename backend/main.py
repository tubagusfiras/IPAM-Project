from contextlib import asynccontextmanager
import asyncio, subprocess, ipaddress, time, os, json, math, io, csv
from datetime import datetime, timedelta, timezone
from typing import Optional, List

import uuid

import asyncpg
from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Request, Header, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from loguru import logger
import time as time_module
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from weasyprint import HTML as WeasyprintHTML
import bcrypt, jwt
import redis.asyncio as aioredis

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io
from weasyprint import HTML as WeasyprintHTML
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── CORE MODULE IMPORTS ──────────────────────────────────────
from core.config import DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS, SCAN_TTL, ALLOWED_ORIGINS

# ── REDIS ────────────────────────────────────────────────────
redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
SCAN_TTL = 60 * 60 * 24  # 24 jam
from core.cache import cache_get, cache_set, cache_del

# ── SECURITY ─────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)

def create_jwt_token(user_id: str, username: str, role: str) -> str:
    payload = {"sub": str(user_id), "username": username, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
               "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired, please login again")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not credentials:
        raise HTTPException(401, "Not authenticated")
    return decode_jwt_token(credentials.credentials)

async def validate_api_key(key: str) -> dict | None:
    """Validate API key against stored hashes."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT name, key_hash, permissions FROM api_keys WHERE expires_at IS NULL OR expires_at > NOW()")
        for row in rows:
            if bcrypt.checkpw(key.encode(), row["key_hash"].encode()):
                return {"sub": f"apikey:{row['name']}", "username": f"api:{row['name']}", "role": "apikey"}
    return None

async def get_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    api_key: Optional[str] = Header(None, alias="X-API-Key")
) -> dict:
    """Support both JWT (browser) and API Key (machine)."""
    if credentials:
        return decode_jwt_token(credentials.credentials)
    if api_key:
        result = await validate_api_key(api_key)
        if result:
            return result
    raise HTTPException(401, "Not authenticated")

pool: asyncpg.Pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    from core.database import pool as db_pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    import core.database
    core.database.pool = pool
    yield
    await pool.close()

app = FastAPI(title="IPAM API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Prometheus metrics
REQUEST_COUNT = Counter("ipam_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("ipam_request_duration_seconds", "Request latency in seconds", ["method", "endpoint"],
                            buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0))

# ------------------------------------------------------------------
# AUTH MIDDLEWARE
# ------------------------------------------------------------------
PUBLIC_PATHS = {"/api/v1/auth/login", "/api/v1/health/detailed", "/metrics", "/docs", "/openapi.json", "/redoc", "/api/v1/ping-trace/ping", "/api/v1/ping-trace/traceroute", "/api/v1/ping-trace/lookup", "/api/v1/ping-trace/mtr"}
PUBLIC_PREFIXES = {"/api/v1/export/block", "/api/v1/export/summary", "/api/v1/export/blocks", "/api/v1/ping/"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in PUBLIC_PATHS or request.method == "OPTIONS" or path == "/":
        return await call_next(request)
    if any(path.startswith(p) for p in PUBLIC_PREFIXES):
        return await call_next(request)
    if not path.startswith("/api/v1/"):
        return await call_next(request)
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    try:
        request.state.user = decode_jwt_token(auth_header.replace("Bearer ", "", 1))
    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
    return await call_next(request)

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:12]
    request.state.request_id = req_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time_module.time()
    response = await call_next(request)
    REQUEST_COUNT.labels(request.method, request.url.path, str(response.status_code)).inc()
    REQUEST_LATENCY.labels(request.method, request.url.path).observe(time_module.time() - start)
    return response

async def get_db():
    async with pool.acquire() as conn:
        yield conn

def log_action(conn, table, record_id, action, old=None, new=None):
    return conn.execute(
        "INSERT INTO audit_log (table_name, record_id, action, old_data, new_data) VALUES ($1,$2,$3,$4,$5)",
        table, record_id, action, json.dumps(old) if old else None, json.dumps(new) if new else None)

# ── ROUTE MODULE IMPORTS ─────────────────────────────────────
from models.schemas import SiteIn, CustomerIn, VlanIn, BlockIn, AllocIn, LoginIn, ChangePasswordIn, UserIn, UserUpdateIn
from api.routes.sites import router as sites_router
from api.routes.customers import router as customers_router
from api.routes.vlans import router as vlans_router
from api.routes.blocks import router as blocks_router
from api.routes.allocations import router as allocations_router
app.include_router(sites_router)
app.include_router(customers_router)
app.include_router(vlans_router)
app.include_router(blocks_router)
app.include_router(allocations_router)

# ------------------------------------------------------------------
# HEALTH & DASHBOARD
# ------------------------------------------------------------------
@app.get("/health", summary="Simple health check", tags=["Health"])
async def health():
    return {"status": "ok"}

@app.get("/api/v1/health/detailed", summary="Detailed health — DB + Redis status", tags=["Health"])
async def health_detailed():
    h = {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat(), "services": {}}
    try:
        await pool.fetchval("SELECT 1")
        h["services"]["database"] = {"status": "ok", "pool_size": pool.get_size(), "pool_free": pool.get_idle_size()}
    except Exception as e:
        h["services"]["database"] = {"status": "error", "error": str(e)}
        h["status"] = "degraded"
    try:
        await redis_client.ping()
        info = await redis_client.info("memory")
        h["services"]["redis"] = {"status": "ok", "used_memory_human": info.get("used_memory_human", "unknown")}
    except Exception as e:
        h["services"]["redis"] = {"status": "error", "error": str(e)}
        h["status"] = "degraded"
    h["ok_count"] = sum(1 for s in h["services"].values() if s["status"] == "ok")
    h["total_count"] = len(h["services"])
    return h

@app.get("/metrics", summary="Prometheus metrics endpoint", tags=["Monitoring"])
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/v1/dashboard/stats", summary="Dashboard stats — counts + utilization", tags=["Dashboard"])
async def dashboard_stats(db=Depends(get_db)):
    cached = await cache_get("dashboard:stats")
    if cached: return cached
    stats = {}
    stats["total_blocks"]      = await db.fetchval("SELECT COUNT(*) FROM ip_blocks")
    stats["total_allocations"] = await db.fetchval("SELECT COUNT(*) FROM allocations")
    stats["total_customers"]   = await db.fetchval("SELECT COUNT(*) FROM customers WHERE is_active")
    stats["total_vlans"]       = await db.fetchval("SELECT COUNT(*) FROM vlans")
    stats["total_sites"]       = await db.fetchval("SELECT COUNT(*) FROM sites")
    stats["ipv4_blocks"]       = await db.fetchval("SELECT COUNT(*) FROM ip_blocks WHERE ip_version='IPv4'")
    stats["ipv6_blocks"]       = await db.fetchval("SELECT COUNT(*) FROM ip_blocks WHERE ip_version='IPv6'")
    stats["alloc_by_status"]   = dict(await db.fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE status='active')    AS active,
            COUNT(*) FILTER (WHERE status='available') AS available,
            COUNT(*) FILTER (WHERE status='reserved')  AS reserved,
            COUNT(*) FILTER (WHERE status='deprecated') AS deprecated
        FROM allocations
    """))
    _RECENT_SQL = " ".join([
        'SELECT b.prefix::text, b.name, b.ip_version, s.name AS site_name,',
        'COUNT(a.id) AS total_allocations,',
        "COUNT(a.id) FILTER (WHERE a.status = 'active') AS active_allocations,",
        'CASE WHEN family(b.prefix) = 4 THEN',
        "COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix",
        'AND NOT EXISTS (SELECT 1 FROM allocations a2 WHERE a2.block_id = b.id',
        "AND a2.id != a.id AND a2.prefix::cidr >> a.prefix::cidr AND a2.status != 'available')",
        "THEN (2::bigint ^ (32 - masklen(a.prefix::cidr))) ELSE 0 END), 0)",
        'ELSE',
        "COALESCE(SUM(CASE WHEN a.status = 'active' AND a.prefix::cidr != b.prefix",
        'AND NOT EXISTS (SELECT 1 FROM allocations a2 WHERE a2.block_id = b.id',
        "AND a2.id != a.id AND a2.prefix::cidr >> a.prefix::cidr AND a2.status != 'available')",
        "THEN (2::numeric ^ (128 - masklen(a.prefix::cidr))) ELSE 0 END), 0)",
        'END AS used_ips,',
        "CASE WHEN family(b.prefix) = 4 THEN (2::bigint ^ (32 - masklen(b.prefix)))::numeric",
        "ELSE (2::numeric ^ (128 - masklen(b.prefix)))",
        'END AS total_ips',
        'FROM ip_blocks b LEFT JOIN sites s ON b.site_id = s.id',
        'LEFT JOIN allocations a ON a.block_id = b.id',
        'GROUP BY b.id, b.prefix, b.name, b.ip_version, s.name',
        'ORDER BY b.prefix::inet LIMIT 10',
    ])
    stats["recent_blocks"] = [dict(r) for r in await db.fetch(_RECENT_SQL)]
    await cache_set("dashboard:stats", stats, ttl=30)
    return stats

# ------------------------------------------------------------------

# ------------------------------------------------------------------
# CSV IMPORT (preview + confirm)
# ------------------------------------------------------------------
import csv, io, ipaddress
from fastapi import UploadFile, File, Form



from services.csv_parser import parse_ipv4_csv, parse_ipv6_csv


# EXPORT
# ------------------------------------------------------------------

def _ip_to_int(ip):
    p = list(map(int, ip.split(".")))
    return (p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3]

def _int_to_ip(n):
    return f"{(n>>24)&255}.{(n>>16)&255}.{(n>>8)&255}.{n&255}"

def _calc_usable(prefix):
    try:
        addr, plen = prefix.split("/")
        plen = int(plen)
        base = _ip_to_int(addr)
        size = 2**(32-plen)
        if size <= 2:
            return f"{_int_to_ip(base)} - {_int_to_ip(base+size-1)}"
        return f"{_int_to_ip(base+1)} - {_int_to_ip(base+size-2)}"
    except:
        return ""

def _calc_gaps(alloc_prefixes, block_prefix):
    try:
        addr, plen = block_prefix.split("/")
        b_start = _ip_to_int(addr)
        b_end = b_start + 2**(32-int(plen)) - 1
        sorted_p = sorted(alloc_prefixes, key=lambda p: _ip_to_int(p.split("/")[0]))
        gaps, cursor = [], b_start
        for p in sorted_p:
            a_start = _ip_to_int(p.split("/")[0])
            a_end = a_start + 2**(32-int(p.split("/")[1])) - 1
            if a_start > cursor:
                gaps.append({"range": f"{_int_to_ip(cursor)} - {_int_to_ip(a_start-1)}", "size": a_start-cursor})
            cursor = max(cursor, a_end+1)
        if cursor <= b_end:
            gaps.append({"range": f"{_int_to_ip(cursor)} - {_int_to_ip(b_end)}", "size": b_end-cursor+1})
        return gaps
    except:
        return []

OWNER_LABELS = {"customer":"Customer","internal":"Internal","ptp":"PTP","peering":"Peering","management":"Management","reserved":"Reserved"}
STATUS_COLORS = {"active":"FF22c55e","reserved":"FF71717a","available":"FF38e8c6","deprecated":"FFef4444"}
OWNER_COLORS  = {"customer":"FF3b82f6","internal":"FF22c55e","ptp":"FFf59e0b","peering":"FFa855f7","management":"FF0ea5e9","reserved":"FF71717a"}

def _thin_border():
    s = Side(style="thin", color="FFe2e8f0")
    return Border(left=s, right=s, top=s, bottom=s)


def _build_summary_sheet(ws, block, allocs):
    bdr = _thin_border()
    left   = Alignment(horizontal="left",   vertical="center")
    center = Alignment(horizontal="center", vertical="center")

    used  = int(block.get("used_ips") or 0)
    total = int(block.get("total_ips") or 1)
    free  = max(0, total-used)
    pct   = round(used/total*100,1) if total else 0
    pct_color = "FFef4444" if pct>85 else "FFf59e0b" if pct>60 else "FF22c55e"

    col_widths = [22,14,20,30,16,14,14]
    for i,w in enumerate(col_widths,1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Row 1: Title
    ws.merge_cells("A1:E1")
    ws["A1"] = str(block["prefix"])
    ws["A1"].font = Font(name="Calibri",bold=True,size=20,color="FF3b82f6")
    ws["A1"].alignment = left
    ws["A1"].fill = PatternFill("solid",start_color="FF0a0f1e")
    ws.row_dimensions[1].height = 36

    ws.merge_cells("F1:G1")
    ws["F1"] = str(block.get("status","")).upper()
    sc = "FF22c55e" if block.get("status")=="active" else "FF71717a"
    ws["F1"].font = Font(name="Calibri",bold=True,size=11,color=sc)
    ws["F1"].fill = PatternFill("solid",start_color="FF0a0f1e")
    ws["F1"].alignment = center
    ms = Side(style="medium",color=sc)
    ws["F1"].border = Border(left=ms,right=ms,top=ms,bottom=ms)

    # Row 2-3: Info
    labels = ["NAME","ASN","ROUTER","OPERATOR","SITE","",""]
    values = [block.get("name",""),block.get("asn",""),block.get("router",""),
              block.get("operator",""),block.get("site_name",""),"",""]
    for i,(lbl,val) in enumerate(zip(labels,values),1):
        cl = ws.cell(row=2,column=i,value=lbl)
        cl.font=Font(name="Calibri",bold=True,size=8,color="FF64748b")
        cl.fill=PatternFill("solid",start_color="FF0d1424"); cl.alignment=left
        cv = ws.cell(row=3,column=i,value=val)
        cv.font=Font(name="Courier New" if i in (2,3) else "Calibri",bold=True,size=11,
                     color="FFFFFFFF" if val else "FF334155")
        cv.fill=PatternFill("solid",start_color="FF0d1424"); cv.alignment=left
    ws.row_dimensions[2].height=13; ws.row_dimensions[3].height=22

    # Row 4: spacer
    for i in range(1,8):
        ws.cell(row=4,column=i).fill=PatternFill("solid",start_color="FF1e293b")
    ws.row_dimensions[4].height=6

    # Rows 5-6: Stats
    active_c = len([a for a in allocs if a.get("status")=="active"])
    resvd_c  = len([a for a in allocs if a.get("status")=="reserved"])
    stats = [("TOTAL ALLOC",str(len(allocs)),"FFFFFFFF"),
             ("ACTIVE",str(active_c),"FF22c55e"),
             ("RESERVED",str(resvd_c),"FF71717a"),
             ("FREE IPs",f"{free:,}","FF38e8c6"),
             ("USED IPs",f"{used:,}","FF3b82f6"),
             ("TOTAL IPs",f"{total:,}","FF94a3b8"),
             ("UTILIZATION",f"{pct}%",pct_color)]
    for i,(lbl,val,col) in enumerate(stats,1):
        fill=PatternFill("solid",start_color="FF0f172a")
        cl=ws.cell(row=5,column=i,value=lbl)
        cl.font=Font(name="Calibri",bold=True,size=8,color="FF64748b")
        cl.fill=fill; cl.border=bdr; cl.alignment=left
        cv=ws.cell(row=6,column=i,value=val)
        cv.font=Font(name="Calibri",bold=True,size=18,color=col)
        cv.fill=fill; cv.border=bdr; cv.alignment=left
    ws.row_dimensions[5].height=15; ws.row_dimensions[6].height=34

    # Row 7: util bar
    filled=max(1,round(pct/100*7)) if pct>0 else 0
    for i in range(1,8):
        ws.cell(row=7,column=i).fill=PatternFill("solid",
            start_color=pct_color if i<=filled else "FF1e293b")
    ws.row_dimensions[7].height=10

    # Row 8: spacer
    for i in range(1,8):
        ws.cell(row=8,column=i).fill=PatternFill("solid",start_color="FF1e293b")
    ws.row_dimensions[8].height=6

    # Rows 9-11: Type breakdown
    owner_labels={"customer":"Customer","internal":"Internal","ptp":"PTP",
                  "peering":"Peering","management":"Mgmt","reserved":"Reserved"}
    owner_colors={"customer":"FF3b82f6","internal":"FF22c55e","ptp":"FFf59e0b",
                  "peering":"FFa855f7","management":"FF0ea5e9","reserved":"FF71717a"}
    owner_counts={}
    for a in allocs:
        o=a.get("owner_type","customer")
        owner_counts[o]=owner_counts.get(o,0)+1

    ws.cell(row=9,column=1,value="TYPE BREAKDOWN").font=Font(name="Calibri",bold=True,size=8,color="FF64748b")
    ws.cell(row=9,column=1).fill=PatternFill("solid",start_color="FF0d1424")
    ws.row_dimensions[9].height=14

    for i,(k,v) in enumerate(owner_counts.items(),1):
        oc=owner_colors.get(k,"FF94a3b8")
        fill=PatternFill("solid",start_color="FF0f172a")
        lbl=ws.cell(row=10,column=i,value=owner_labels.get(k,k))
        lbl.font=Font(name="Calibri",bold=True,size=9,color=oc)
        lbl.fill=fill; lbl.border=bdr; lbl.alignment=left
        val=ws.cell(row=11,column=i,value=v)
        val.font=Font(name="Calibri",bold=True,size=20,color=oc)
        val.fill=fill; val.border=bdr; val.alignment=left
    ws.row_dimensions[10].height=16; ws.row_dimensions[11].height=34

    ws.sheet_view.showGridLines=False


def _build_block_sheet_allocs(ws, block, allocs):
    hdr_font = Font(name="Arial", bold=True, color="FFFFFFFF", size=10)
    hdr_fill = PatternFill("solid", start_color="FF1e293b")
    bdr = _thin_border()
    center = Alignment(horizontal="center", vertical="center")
    left   = Alignment(horizontal="left",   vertical="center")

    ws.merge_cells("A1:H1")
    ws["A1"] = f"Block: {block['prefix']}"
    ws["A1"].font = Font(name="Arial", bold=True, size=14, color="FF3b82f6")
    ws["A1"].alignment = left
    ws.row_dimensions[1].height = 28

    info = [("Name",block.get("name","")),("ASN",block.get("asn","")),
            ("Router",block.get("router","")),("Operator",block.get("operator","")),
            ("Site",block.get("site_name","")),("Status",str(block.get("status","")).upper())]
    for i,(k,v) in enumerate(info):
        col = (i%3)*2+1
        row = 2+i//3
        ws.cell(row=row,column=col,value=k).font = Font(name="Arial",bold=True,size=9,color="FF94a3b8")
        ws.cell(row=row,column=col+1,value=v).font = Font(name="Arial",size=10)

    used  = int(block.get("used_ips") or 0)
    total = int(block.get("total_ips") or 1)
    pct   = round(used/total*100,1) if total else 0
    ws.merge_cells("A4:H4")
    ws["A4"] = f"Utilization: {used:,} / {total:,} IPs  ({pct}%)"
    ws["A4"].font = Font(name="Arial",bold=True,size=10,
        color="FFef4444" if pct>85 else "FFf59e0b" if pct>60 else "FF22c55e")
    ws.row_dimensions[4].height = 20

    headers   = ["#","Prefix","Usable Range","Size","Type","Customer / Description","VLAN","Status"]
    col_widths = [4,  22,      30,            8,     12,    35,                     8,     12]
    for i,(h,w) in enumerate(zip(headers,col_widths),1):
        c = ws.cell(row=6,column=i,value=h)
        c.font=hdr_font; c.fill=hdr_fill; c.alignment=center; c.border=bdr
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[6].height=22

    is_v6 = ":" in str(block.get("prefix",""))
    sorted_allocs = sorted(allocs, key=lambda a: _ip_to_int(a["prefix"].split("/")[0]) if not is_v6 else 0)
    gaps = [] if is_v6 else _calc_gaps([a["prefix"] for a in sorted_allocs], str(block["prefix"]))

    rows = [{"_free":False,**a} for a in sorted_allocs]
    for g in gaps:
        rows.append({"_free":True,**g})
    if not is_v6:
        rows.sort(key=lambda r: _ip_to_int(r["prefix"].split("/")[0]) if not r["_free"] else _ip_to_int(r["range"].split(" - ")[0]))

    alloc_idx = 0
    for r_idx,row in enumerate(rows,7):
        ws.row_dimensions[r_idx].height=18
        if row["_free"]:
            ff = PatternFill("solid",start_color="FF0a1a0f")
            for col in range(1,9):
                c=ws.cell(row=r_idx,column=col); c.fill=ff; c.border=bdr
            ws.cell(row=r_idx,column=1,value="-").font=Font(name="Arial",size=9,color="FF334155")
            ws.cell(row=r_idx,column=2,value=row["range"]).font=Font(name="Courier New",size=9,italic=True,color="FF22c55e")
            ws.cell(row=r_idx,column=3,value="Free").font=Font(name="Arial",size=9,italic=True,color="FF22c55e")
            ws.cell(row=r_idx,column=4,value=row["size"]).font=Font(name="Arial",size=9,color="FF22c55e")
            ws.cell(row=r_idx,column=5,value="FREE").font=Font(name="Arial",size=9,color="FF22c55e")
            ws.cell(row=r_idx,column=8,value="AVAILABLE").font=Font(name="Arial",size=9,color="FF22c55e")
        else:
            alloc_idx+=1
            owner  = row.get("owner_type","customer")
            status = row.get("status","active")
            o_color = OWNER_COLORS.get(owner,"FF94a3b8")
            s_color = STATUS_COLORS.get(status,"FF94a3b8")
            rf = PatternFill("solid",start_color="FF0f172a" if alloc_idx%2==0 else "FF111827")
            try: size = 2**(32-int(row["prefix"].split("/")[1])) if not is_v6 else "-"
            except: size="-"
            for col in range(1,9):
                c=ws.cell(row=r_idx,column=col); c.fill=rf; c.border=bdr; c.alignment=left
            ws.cell(row=r_idx,column=1,value=alloc_idx).font=Font(name="Arial",size=9,color="FF94a3b8")
            ws.cell(row=r_idx,column=1).alignment=center
            ws.cell(row=r_idx,column=2,value=row["prefix"]).font=Font(name="Courier New",bold=True,size=10,color="FF3b82f6")
            ws.cell(row=r_idx,column=3,value=_calc_usable(row["prefix"])).font=Font(name="Courier New",size=9,color="FF94a3b8")
            ws.cell(row=r_idx,column=4,value=size).font=Font(name="Arial",size=9,color="FF64748b")
            ws.cell(row=r_idx,column=4).alignment=center
            ws.cell(row=r_idx,column=5,value=OWNER_LABELS.get(owner,owner)).font=Font(name="Arial",bold=True,size=9,color=o_color)
            desc = row.get("customer_name") or row.get("description") or ""
            ws.cell(row=r_idx,column=6,value=desc).font=Font(name="Arial",size=10)
            vlan = row.get("vlan_vid")
            ws.cell(row=r_idx,column=7,value=str(vlan) if vlan else "").font=Font(name="Courier New",size=9,color="FF94a3b8")
            ws.cell(row=r_idx,column=7).alignment=center
            ws.cell(row=r_idx,column=8,value=status.upper()).font=Font(name="Arial",bold=True,size=9,color=s_color)
            ws.cell(row=r_idx,column=8).alignment=center

    ws.freeze_panes="A7"
    ws.sheet_view.showGridLines=False

BLOCK_QUERY = """
    SELECT b.*, s.name AS site_name,
           CASE WHEN family(b.prefix)=4 THEN
               COALESCE(SUM(CASE WHEN a.status='active' AND a.prefix::cidr!=b.prefix
                   AND NOT EXISTS(SELECT 1 FROM allocations a2 WHERE a2.block_id=b.id
                       AND a2.id!=a.id AND a2.prefix::cidr>>a.prefix::cidr AND a2.status='active')
                   THEN (2::bigint^(32-masklen(a.prefix::cidr))) ELSE 0 END),0)::numeric
           ELSE 0 END AS used_ips,
           CASE WHEN family(b.prefix)=4 THEN (2::bigint^(32-masklen(b.prefix)))::numeric
           ELSE 0 END AS total_ips
    FROM ip_blocks b LEFT JOIN sites s ON b.site_id=s.id
    LEFT JOIN allocations a ON a.block_id=b.id
    WHERE b.id=$1::uuid GROUP BY b.id,s.name
"""

ALLOC_QUERY = """
    SELECT a.prefix::text, a.status, a.owner_type, a.description, a.notes,
           c.name AS customer_name, v.vid AS vlan_vid
    FROM allocations a
    LEFT JOIN customers c ON a.customer_id=c.id
    LEFT JOIN vlans v ON a.vlan_id=v.id
    WHERE a.block_id=$1::uuid ORDER BY a.prefix::inet
"""

ALL_BLOCKS_QUERY = """
    SELECT b.*, s.name AS site_name,
           CASE WHEN family(b.prefix)=4 THEN
               COALESCE(SUM(CASE WHEN a.status='active' AND a.prefix::cidr!=b.prefix
                   AND NOT EXISTS(SELECT 1 FROM allocations a2 WHERE a2.block_id=b.id
                       AND a2.id!=a.id AND a2.prefix::cidr>>a.prefix::cidr AND a2.status='active')
                   THEN (2::bigint^(32-masklen(a.prefix::cidr))) ELSE 0 END),0)::numeric
           ELSE 0 END AS used_ips,
           CASE WHEN family(b.prefix)=4 THEN (2::bigint^(32-masklen(b.prefix)))::numeric
           ELSE 0 END AS total_ips
    FROM ip_blocks b LEFT JOIN sites s ON b.site_id=s.id
    LEFT JOIN allocations a ON a.block_id=b.id
    GROUP BY b.id,s.name ORDER BY b.prefix::inet
"""

@app.get("/api/v1/export/block/{block_id}", summary="Export block to Excel", tags=["Export"])
async def export_block(block_id: str, db=Depends(get_db)):
    row = await db.fetchrow(BLOCK_QUERY, block_id)
    if not row: raise HTTPException(404, "Block not found")
    allocs = await db.fetch(ALLOC_QUERY, block_id)
    allocs_list = [dict(a) for a in allocs]
    block_dict = dict(row)
    wb = openpyxl.Workbook()
    ws_sum = wb.active
    ws_sum.title = "Summary"
    _build_summary_sheet(ws_sum, block_dict, allocs_list)
    ws_alloc = wb.create_sheet(title="Allocations")
    _build_block_sheet_allocs(ws_alloc, block_dict, allocs_list)
    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    fname = f"IPAM_{str(row['prefix']).replace('/','_').replace('.','_')}.xlsx"
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"})

@app.post("/api/v1/export/blocks", summary="Export multiple blocks to Excel", tags=["Export"])
async def export_blocks(body: dict, db=Depends(get_db)):
    block_ids = body.get("block_ids", [])
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for bid in block_ids:
        row = await db.fetchrow(BLOCK_QUERY, bid)
        if not row: continue
        allocs = await db.fetch(ALLOC_QUERY, bid)
        allocs_list = [dict(a) for a in allocs]
        block_dict = dict(row)
        ws_sum = wb.create_sheet(title=str(row["prefix"]).replace("/","_")[:28]+"_S")
        _build_summary_sheet(ws_sum, block_dict, allocs_list)
        ws_alloc = wb.create_sheet(title=str(row["prefix"]).replace("/","_")[:28]+"_A")
        _build_block_sheet_allocs(ws_alloc, block_dict, allocs_list)
    ws_sum = wb.create_sheet(title="Summary", index=0)
    hdr_font = Font(name="Arial",bold=True,color="FFFFFFFF",size=10)
    hdr_fill = PatternFill("solid",start_color="FF1e293b")
    bdr = _thin_border()
    hdrs   = ["#","Prefix","Name","ASN","Router","Site","Used IPs","Total IPs","Util %","Status"]
    widths = [4,   22,      25,    12,   20,      15,    12,        12,         10,      12]
    for i,(h,w) in enumerate(zip(hdrs,widths),1):
        c=ws_sum.cell(row=1,column=i,value=h)
        c.font=hdr_font; c.fill=hdr_fill; c.border=bdr
        c.alignment=Alignment(horizontal="center")
        ws_sum.column_dimensions[get_column_letter(i)].width=w
    ws_sum.row_dimensions[1].height=22
    all_blocks = await db.fetch(ALL_BLOCKS_QUERY)
    for i,b in enumerate(all_blocks,2):
        used=int(b["used_ips"] or 0); total=int(b["total_ips"] or 1)
        pct=round(used/total*100,1) if total else 0
        s_color="FFef4444" if pct>85 else "FFf59e0b" if pct>60 else "FF22c55e"
        rf=PatternFill("solid",start_color="FF0f172a" if i%2==0 else "FF111827")
        vals=[i-1,str(b["prefix"]),b.get("name",""),b.get("asn",""),b.get("router",""),
              b.get("site_name",""),used,total,pct,str(b.get("status","")).upper()]
        for j,v in enumerate(vals,1):
            c=ws_sum.cell(row=i,column=j,value=v)
            c.fill=rf; c.border=bdr; c.font=Font(name="Arial",size=10)
            if j==9: c.font=Font(name="Arial",bold=True,size=10,color=s_color)
        ws_sum.row_dimensions[i].height=18
    ws_sum.freeze_panes="A2"
    ws_sum.sheet_view.showGridLines=False
    buf=io.BytesIO()
    wb.save(buf); buf.seek(0)
    return StreamingResponse(buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=IPAM_Export.xlsx"})

@app.get("/api/v1/export/summary", summary="Export all blocks summary to Excel", tags=["Export"])
async def export_summary(db=Depends(get_db)):
    return await export_blocks({"block_ids": []}, db)


# ------------------------------------------------------------------
# PDF EXPORT HELPERS
# ------------------------------------------------------------------

def _get_theme_colors(dark: bool) -> dict:
    if dark:
        return {
            "bg":         "#0f172a",
            "surface":    "#1e293b",
            "surface2":   "#334155",
            "text":       "#f1f5f9",
            "text_muted": "#94a3b8",
            "border":     "#334155",
            "th_bg":      "#0f172a",
            "th_text":    "#f1f5f9",
            "td_alt":     "#1a2744",
            "card_bg":    "#1e293b",
            "card_border":"#334155",
        }
    else:
        return {
            "bg":         "#ffffff",
            "surface":    "#f8fafc",
            "surface2":   "#f1f5f9",
            "text":       "#0f172a",
            "text_muted": "#64748b",
            "border":     "#e2e8f0",
            "th_bg":      "#1e293b",
            "th_text":    "#ffffff",
            "td_alt":     "#f8fafc",
            "card_bg":    "#ffffff",
            "card_border":"#e2e8f0",
        }


def _build_block_section(block: dict, allocs: list, theme: dict, is_first: bool = True) -> str:
    prefix    = block.get("prefix", "")
    name      = block.get("name", "") or ""
    # Jangan tampilkan name jika sama dengan prefix
    display_name = name if name and name != prefix else ""
    site      = block.get("site_name", "") or ""
    asn       = block.get("asn", "") or ""
    router    = block.get("router", "") or ""
    status    = str(block.get("status", "")).upper()
    used      = int(block.get("used_ips", 0) or 0)
    total     = int(block.get("total_ips", 1) or 1)
    free      = total - used
    pct       = round(used / total * 100, 1) if total else 0
    bar_color = "#ef4444" if pct > 85 else "#f59e0b" if pct > 60 else "#22c55e"
    t         = theme
    page_break = "" if is_first else '<div style="page-break-before:always"></div>'
    now       = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')

    type_colors = {
        "customer":"#3b82f6","infrastructure":"#8b5cf6",
        "ptp":"#f59e0b","peering":"#a855f7",
        "management":"#0ea5e9","reserved":"#71717a","free":"#6b7280"
    }

    rows_html = ""
    for a in allocs:
        typ  = a.get("owner_type", "") or ""
        tc   = type_colors.get(typ, "#6b7280")
        vlan = a.get('vlan_name') or (f"VID {a.get('vlan_vid')}" if a.get('vlan_vid') else '-')
        rows_html += f"""
        <tr>
          <td class="col-prefix">{a.get('prefix','')}</td>
          <td class="col-customer">{a.get('customer_name','') or '-'}</td>
          <td class="col-type"><span style="background:{tc};color:#fff;padding:2px 7px;border-radius:4px;font-size:9.5px;font-weight:600">{typ}</span></td>
          <td class="col-vlan" style="color:{t['text_muted']}">{vlan}</td>
          <td class="col-status" style="color:{t['text_muted']}">{str(a.get('status','')).upper()}</td>
          <td class="col-desc" style="color:{t['text_muted']}">{a.get('description','') or '-'}</td>
        </tr>"""

    meta_items = []
    if site:   meta_items.append(f"<span><b>Site:</b> {site}</span>")
    if asn:    meta_items.append(f"<span><b>ASN:</b> {asn}</span>")
    if router: meta_items.append(f"<span><b>Router:</b> {router}</span>")
    meta_items.append(f"<span><b>Status:</b> {status}</span>")
    meta_html = " &nbsp;·&nbsp; ".join(meta_items)

    return f"""{page_break}
  <div class="block-header">
    <h1>{prefix}{(' &nbsp;<span class="name-tag">' + display_name + '</span>') if display_name else ''}</h1>
    <div class="sub">{meta_html}</div>
  </div>
  <table class="cards-table"><tr>
    <td><div class="card-label">Total IPs</div><div class="card-value">{total:,}</div></td>
    <td><div class="card-label">Used</div><div class="card-value" style="color:#3b82f6">{used:,}</div></td>
    <td><div class="card-label">Free</div><div class="card-value" style="color:#22c55e">{free:,}</div></td>
    <td><div class="card-label">Utilization</div><div class="card-value" style="color:{bar_color}">{pct}%</div></td>
  </tr></table>
  <div class="bar-label">Utilization &mdash; {pct}%</div>
  <div class="bar-wrap"><div class="bar-fill" style="width:{pct}%;background:{bar_color}"></div></div>
  <table class="alloc-table">
    <thead><tr>
      <th class="col-prefix">Prefix</th>
      <th class="col-customer">Customer</th>
      <th class="col-type">Type</th>
      <th class="col-vlan">VLAN</th>
      <th class="col-status">Status</th>
      <th class="col-desc">End Device XC</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
  <div class="footer">Generated by IPAM SDI &mdash; {now} &nbsp;&nbsp;|&nbsp;&nbsp; {prefix}</div>"""


def _wrap_html(body: str, theme: dict) -> str:
    t = theme
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page {{ size: A4; margin: 0; background: {t['bg']}; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{ background: {t['bg']}; width: 100%; height: 100%; }}
  body {{ font-family: Arial, sans-serif; font-size: 12px; color: {t['text']}; padding: 15mm; }}
  h1   {{ font-size: 16px; margin: 0 0 4px 0; color: {t['text']}; font-weight: 700; }}
  .name-tag {{ font-size: 12px; font-weight: 400; color: {t['text_muted']}; }}
  .sub {{ color: {t['text_muted']}; font-size: 10px; margin-bottom: 12px; line-height: 1.6; }}
  .sub b {{ color: {t['text']}; font-weight: 600; }}
  .block-header {{ margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid {t['border']}; }}
  .cards-table {{ width: 100%; border-collapse: separate; border-spacing: 6px; margin-bottom: 14px; }}
  .cards-table td {{ border: 1px solid {t['card_border']}; border-radius: 5px; padding: 8px 12px; background: {t['card_bg']}; width: 25%; }}
  .card-label {{ font-size: 8px; color: {t['text_muted']}; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }}
  .card-value {{ font-size: 20px; font-weight: 700; color: {t['text']}; }}
  .bar-wrap {{ background:{t['border']}; border-radius:3px; height:7px; margin-bottom:14px; overflow:hidden; }}
  .bar-fill {{ height:7px; border-radius:3px; }}
  .bar-label {{ font-size:9px; color:{t['text_muted']}; margin-bottom:3px; }}
  .alloc-table {{ width:100%; border-collapse:collapse; font-size:10.5px; table-layout:fixed; }}
  .alloc-table th {{ background:{t['th_bg']}; color:{t['th_text']}; padding:7px 8px; text-align:left; font-size:9.5px; font-weight:700; letter-spacing:0.03em; }}
  .alloc-table tr:nth-child(even) td {{ background:{t['td_alt']}; }}
  .alloc-table td {{ padding:6px 8px; border-bottom:1px solid {t['border']}; color:{t['text']}; vertical-align:middle; overflow:hidden; }}
  .col-prefix {{ width:130px; font-family:monospace; font-size:10px; font-weight:600; }}
  .col-customer {{ width:110px; }}
  .col-type {{ width:90px; }}
  .col-vlan {{ width:70px; }}
  .col-status {{ width:75px; font-weight:600; }}
  .col-desc {{ }}
  .footer {{ margin-top:14px; padding-top:8px; border-top:1px solid {t['border']}; font-size:9px; color:{t['text_muted']}; }}
</style>
</head>
<body>{body}</body>
</html>"""


def _build_pdf_html(block: dict, allocs: list, dark: bool = False) -> str:
    theme = _get_theme_colors(dark)
    body  = _build_block_section(block, allocs, theme, is_first=True)
    return _wrap_html(body, theme)


def _build_summary_pdf_html(all_blocks: list, dark: bool = False) -> str:
    t = _get_theme_colors(dark)
    rows_html = ""
    for i, b in enumerate(all_blocks, 1):
        used  = int(b.get("used_ips", 0) or 0)
        total = int(b.get("total_ips", 1) or 1)
        pct   = round(used / total * 100, 1) if total else 0
        color = "#ef4444" if pct > 85 else "#f59e0b" if pct > 60 else "#22c55e"
        rows_html += f"""
        <tr>
          <td>{i}</td>
          <td style="font-family:monospace;font-size:11px">{b.get('prefix','')}</td>
          <td>{b.get('name','') or '-'}</td>
          <td>{b.get('asn','') or '-'}</td>
          <td>{b.get('site_name','') or '-'}</td>
          <td>{used}</td>
          <td>{total}</td>
          <td style="color:{color};font-weight:bold">{pct}%</td>
          <td>{str(b.get('status','')).upper()}</td>
        </tr>"""

    body = f"""
  <h1>IPAM Summary Report</h1>
  <div class="sub">Generated: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')} &nbsp;|&nbsp; Total Blocks: {len(all_blocks)}</div>
  <table>
    <thead><tr><th>#</th><th>Prefix</th><th>Name</th><th>ASN</th><th>Site</th><th>Used</th><th>Total</th><th>Util%</th><th>Status</th></tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
  <div class="footer">Generated by IPAM SDI &mdash; {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}</div>"""
    return _wrap_html(body, t)


def _build_multi_pdf_html(blocks_allocs: list, dark: bool = False) -> str:
    theme   = _get_theme_colors(dark)
    sections = []
    for i, (block, allocs) in enumerate(blocks_allocs):
        sections.append(_build_block_section(block, allocs, theme, is_first=(i == 0)))
    return _wrap_html("".join(sections), theme)


# ------------------------------------------------------------------
# PDF EXPORT ENDPOINTS
# ------------------------------------------------------------------

@app.get("/api/v1/export/block/{block_id}/pdf", summary="Export block to PDF", tags=["Export"])
async def export_block_pdf(block_id: str, theme: str = "dark", db=Depends(get_db)):
    row = await db.fetchrow(BLOCK_QUERY, block_id)
    if not row:
        raise HTTPException(404, "Block not found")
    allocs = await db.fetch(ALLOC_QUERY, block_id)
    allocs_list = [dict(a) for a in allocs]
    block_dict = dict(row)
    dark = theme == "dark"
    html = _build_pdf_html(block_dict, allocs_list, dark=dark)
    pdf_bytes = WeasyprintHTML(string=html).write_pdf()
    prefix_safe = str(row["prefix"]).replace("/", "_").replace(".", "_")
    fname = f"IPAM_{prefix_safe}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


@app.get("/api/v1/export/summary/pdf", summary="Export summary to PDF", tags=["Export"])
async def export_summary_pdf(theme: str = "dark", db=Depends(get_db)):
    all_blocks = await db.fetch(ALL_BLOCKS_QUERY)
    all_list = [dict(b) for b in all_blocks]
    dark = theme == "dark"
    html = _build_summary_pdf_html(all_list, dark=dark)
    pdf_bytes = WeasyprintHTML(string=html).write_pdf()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=IPAM_Summary.pdf"}
    )


# ------------------------------------------------------------------
# IP SCAN
# ------------------------------------------------------------------

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

# Active scan sessions: scan_id -> {status, results, progress}
_scan_sessions: dict = {}

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

async def _log_audit(db, action: str, entity_type: str, entity_id, entity_prefix: str,
                      description: str = "", old_data: dict = None, new_data: dict = None,
                      changed_by: str = "admin"):
    """Insert audit log entry."""
    try:
        await db.execute(
            "INSERT INTO audit_logs (action, entity_type, entity_id, entity_prefix, description, changed_by, old_data, new_data) "
            "VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::jsonb,$8::jsonb)",
            action, entity_type, str(entity_id) if entity_id else None, entity_prefix,
            description, changed_by,
            json.dumps(old_data, default=str) if old_data else None,
            json.dumps(new_data, default=str) if new_data else None,
        )
    except Exception as e:
        logger.error("Audit log error: {}", e)

@app.post("/api/v1/scan/start", summary="Start IP scan for a block", tags=["IP Scan"])
async def start_scan(body: dict, db=Depends(get_db)):
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

@app.get("/api/v1/scan/status/{scan_id}", summary="Get scan progress + results", tags=["IP Scan"])
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

@app.post("/api/v1/scan/cancel/{scan_id}", summary="Cancel ongoing scan", tags=["IP Scan"])
async def cancel_scan(scan_id: str):
    """Cancel ongoing scan."""
    if scan_id not in _scan_sessions:
        raise HTTPException(404, "Scan session not found")
    _scan_sessions[scan_id]["status"] = "cancelled"
    await _save_scan_to_redis(scan_id)
    return {"status": "cancelled"}

@app.delete("/api/v1/scan/clear/{scan_id}", summary="Clear scan session", tags=["IP Scan"])
async def clear_scan(scan_id: str):
    """Clear scan session."""
    if scan_id in _scan_sessions:
        del _scan_sessions[scan_id]
    await _delete_scan_from_redis(scan_id)
    return {"status": "cleared"}

@app.post("/api/v1/scan/action", summary="Take action on scan result", tags=["IP Scan"])
async def scan_action(body: dict, db=Depends(get_db)):
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

    if action == "delete":
        await db.execute("DELETE FROM allocations WHERE id=$1::uuid", alloc_id)
        await _log_audit(db, "delete", "allocation", alloc_id, str(prefix),
                          description=f"Deleted via IP Scan — ghost allocation ({old_data.get('customer_name') or old_data.get('owner_type')})",
                          old_data=old_data)
        return {"status": "deleted"}
    elif action == "mark_deprecated":
        await db.execute("UPDATE allocations SET status='deprecated' WHERE id=$1::uuid", alloc_id)
        await _log_audit(db, "update", "allocation", alloc_id, str(prefix),
                          description=f"Marked deprecated via IP Scan ({old_data.get('customer_name') or old_data.get('owner_type')})",
                          old_data=old_data, new_data={**old_data, "status": "deprecated"})
        return {"status": "marked_deprecated"}
    else:
        raise HTTPException(400, "Invalid action")

@app.get("/api/v1/audit-logs", summary="List audit logs", tags=["Audit"])
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
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
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await db.fetch(
        f"SELECT * FROM audit_logs WHERE {where} ORDER BY created_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}",
        *params
    )
    total = await db.fetchval(f"SELECT COUNT(*) FROM audit_logs WHERE {where}", *params[:-2])
    return {"total": total, "items": [dict(r) for r in rows]}


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

@app.get("/api/v1/ping-trace/lookup", summary="Lookup target in IPAM", tags=["Ping & Trace"])
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

@app.get("/api/v1/ping-trace/ping", summary="Ping target (SSE stream)", tags=["Ping & Trace"])
async def stream_ping(target: str = Query(...), count: int = Query(4, ge=1, le=20)):
    if not _validate_target(target):
        raise HTTPException(400, "Invalid target format")
    cmd = ["ping", "-c", str(count), target]
    return StreamingResponse(_stream_command(cmd), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/api/v1/ping-trace/traceroute", summary="Traceroute target (SSE stream)", tags=["Ping & Trace"])
async def stream_traceroute(target: str = Query(...), max_hops: int = Query(30, ge=1, le=64)):
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

@app.get("/api/v1/ping-trace/mtr", summary="MTR realtime (SSE stream)", tags=["Ping & Trace"])
async def stream_mtr(
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


# ------------------------------------------------------------------
# AUTH
# ------------------------------------------------------------------

class LoginIn(BaseModel):
    username: str
    password: str

class ChangePasswordIn(BaseModel):
    old_password: Optional[str] = None
    new_password: str

class UserIn(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"

class UserUpdateIn(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

@app.post("/api/v1/auth/login", summary="Login with username/password", tags=["Authentication"])
@limiter.limit("5/minute")  # Rate limit: 5 login attempts per minute per IP
async def login(request: Request, body: LoginIn, db=Depends(get_db)):
    user = await db.fetchrow(
        "SELECT * FROM users WHERE username=$1 AND is_active=true", body.username
    )
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Invalid username or password")

    await db.execute("UPDATE users SET last_login_at=NOW() WHERE id=$1::uuid", user["id"])
    token = create_jwt_token(user["id"], user["username"], user["role"])

    return {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
        },
        "expires_in_hours": JWT_EXPIRE_HOURS,
    }

@app.get("/api/v1/auth/me", summary="Current user info", tags=["Authentication"])
async def get_me(current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    user = await db.fetchrow("SELECT id, username, email, role, last_login_at FROM users WHERE id=$1::uuid", current_user["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    return dict(user)

@app.post("/api/v1/auth/change-password", summary="Change password", tags=["Authentication"])
async def change_password(body: ChangePasswordIn, current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    user = await db.fetchrow("SELECT * FROM users WHERE id=$1::uuid", current_user["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    # Admin bisa skip old_password check untuk reset user lain, tapi untuk self-change tetap perlu old_password
    if body.old_password and not bcrypt.checkpw(body.old_password.encode(), user["password_hash"].encode()):
        raise HTTPException(400, "Old password is incorrect")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.execute("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2::uuid", new_hash, current_user["sub"])
    return {"status": "password_changed"}

# ------------------------------------------------------------------
# USER MANAGEMENT (admin only)
# ------------------------------------------------------------------

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return current_user

@app.get("/api/v1/users", summary="List all users (admin)", tags=["User Management"])
async def list_users(current_user: dict = Depends(require_admin), db=Depends(get_db)):
    rows = await db.fetch("SELECT id, username, email, role, is_active, last_login_at, created_at FROM users ORDER BY created_at")
    return {"items": [dict(r) for r in rows]}

@app.post("/api/v1/users", status_code=201, summary="Create user (admin)", tags=["User Management"])
async def create_user(body: UserIn, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    existing = await db.fetchrow("SELECT id FROM users WHERE username=$1 OR email=$2", body.username, body.email)
    if existing:
        raise HTTPException(409, "Username or email already exists")
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    row = await db.fetchrow(
        "INSERT INTO users (username, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, username, email, role, is_active, created_at",
        body.username, body.email, hashed, body.role
    )
    await _log_audit(db, "create", "user", row["id"], body.username, description=f"User created: {body.username}", changed_by=current_user["username"])
    return dict(row)

@app.put("/api/v1/users/{user_id}", summary="Update user (admin)", tags=["User Management"])
async def update_user(user_id: str, body: UserUpdateIn, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    existing = await db.fetchrow("SELECT * FROM users WHERE id=$1::uuid", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    email = body.email if body.email is not None else existing["email"]
    role = body.role if body.role is not None else existing["role"]
    is_active = body.is_active if body.is_active is not None else existing["is_active"]
    row = await db.fetchrow(
        "UPDATE users SET email=$1, role=$2, is_active=$3, updated_at=NOW() WHERE id=$4::uuid RETURNING id, username, email, role, is_active",
        email, role, is_active, user_id
    )
    await _log_audit(db, "update", "user", user_id, existing["username"], description=f"User updated: {existing['username']}", changed_by=current_user["username"])
    return dict(row)

@app.delete("/api/v1/users/{user_id}", summary="Delete user (admin)", tags=["User Management"])
async def delete_user(user_id: str, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    if str(user_id) == current_user["sub"]:
        raise HTTPException(400, "Cannot delete your own account")
    existing = await db.fetchrow("SELECT username FROM users WHERE id=$1::uuid", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    await db.execute("DELETE FROM users WHERE id=$1::uuid", user_id)
    await _log_audit(db, "delete", "user", user_id, existing["username"], description=f"User deleted: {existing['username']}", changed_by=current_user["username"])
    return {"status": "deleted"}

@app.post("/api/v1/users/{user_id}/reset-password", summary="Reset user password (admin)", tags=["User Management"])
async def reset_user_password(user_id: str, body: ChangePasswordIn, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    existing = await db.fetchrow("SELECT username FROM users WHERE id=$1::uuid", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.execute("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2::uuid", new_hash, user_id)
    await _log_audit(db, "update", "user", user_id, existing["username"], description=f"Password reset by {current_user['username']}", changed_by=current_user["username"])
    return {"status": "password_reset"}


# ------------------------------------------------------------------
# SEARCH
# ------------------------------------------------------------------
@app.get("/api/v1/search", summary="Global search", tags=["Search"])
async def global_search(q: str = Query(..., min_length=2), db=Depends(get_db)):
    results = {}
    results["blocks"]      = [dict(r) for r in await db.fetch("SELECT id, prefix::text AS label, name, ip_version FROM ip_blocks WHERE prefix::text ILIKE $1 OR name ILIKE $1 LIMIT 5", f"%{q}%")]
    results["allocations"] = [dict(r) for r in await db.fetch("SELECT id, prefix::text AS label, customer_name, status FROM v_allocation_detail WHERE prefix::text ILIKE $1 OR customer_name ILIKE $1 LIMIT 10", f"%{q}%")]
    results["customers"]   = [dict(r) for r in await db.fetch("SELECT id, name AS label, code FROM customers WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 5", f"%{q}%")]
    return results

# ------------------------------------------------------------------
# CSV IMPORT — temporary endpoints
# ------------------------------------------------------------------
import io, csv
from fastapi import UploadFile, File, Form

@app.post("/api/v1/import/preview", summary="Preview CSV import", tags=["Import"])
async def preview_import(file: UploadFile = File(...), db=Depends(get_db)):
    if not file.filename.lower().endswith((".csv", ".xls", ".xlsx", ".txt")):
        raise HTTPException(400, "Hanya file CSV yang didukung")
    content = await file.read()
    if len(content) > 10_000_000:
        raise HTTPException(413, "File terlalu besar (max 10MB)")
    text = content.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")

    # Auto detect format
    first_lines = text.split("\n")[:10]
    is_ipv6 = any("::" in line and "/" in line for line in first_lines)
    # Pass filename untuk fallback prefix extraction dari filename
    meta, allocs = parse_ipv6_csv(text, filename=file.filename) if is_ipv6 else parse_ipv4_csv(text, filename=file.filename)

    # Validasi overlap
    import ipaddress as ip_mod
    overlaps = []
    sorted_a = sorted(allocs, key=lambda a: ip_mod.ip_network(a["prefix"], strict=False))
    for i in range(len(sorted_a)):
        for j in range(i + 1, len(sorted_a)):
            n1 = ip_mod.ip_network(sorted_a[i]["prefix"], strict=False)
            n2 = ip_mod.ip_network(sorted_a[j]["prefix"], strict=False)
            if n1.overlaps(n2):
                overlaps.append({
                    "a": sorted_a[i]["prefix"],
                    "b": sorted_a[j]["prefix"],
                    "a_customer": sorted_a[i].get("customer"),
                    "b_customer": sorted_a[j].get("customer"),
                })
                break

    return {
        "meta": meta,
        "allocations": allocs,
        "total_count": len(allocs),
        "format": "ipv6" if is_ipv6 else "ipv4",
        "overlaps": overlaps,
        "has_overlaps": len(overlaps) > 0,
    }

@app.post("/api/v1/import/confirm", summary="Confirm CSV import", tags=["Import"])
async def confirm_import(body: dict, db=Depends(get_db)):
    meta = body.get("meta", {})
    allocs = body.get("allocations", [])
    site_id = body.get("site_id")

    if not meta.get("prefix"):
        raise HTTPException(400, "Block prefix is required")
    if not allocs:
        raise HTTPException(400, "No allocations to import")

    imported = 0
    skipped = 0
    block_id = None

    async with db.transaction():
        # Create or find block
        existing = await db.fetchrow("SELECT id FROM ip_blocks WHERE prefix >>= $1::inet LIMIT 1", meta["prefix"])
        if existing:
            block_id = existing["id"]
        else:
            block = await db.fetchrow(
                "INSERT INTO ip_blocks (prefix, name, asn, router, operator, site_id, status) VALUES ($1::cidr, $2, $3, $4, $5, $6::uuid, $7) RETURNING id",
                meta["prefix"], meta.get("name") or meta["prefix"], meta.get("asn"), meta.get("router"), meta.get("operator"), site_id, "active"
            )
            block_id = block["id"]

        for alloc in allocs:
            if not alloc.get("prefix"):
                skipped += 1
                continue
            # Auto-correct prefix ke network address (fix host bits set)
            try:
                prefix = str(ipaddress.ip_network(alloc["prefix"], strict=False))
            except ValueError:
                skipped += 1
                continue
            alloc["prefix"] = prefix
            # Skip if already exists
            exists = await db.fetchrow("SELECT id FROM allocations WHERE prefix = $1::cidr AND block_id = $2::uuid", prefix, block_id)
            if exists:
                skipped += 1
                continue

            # Find or create customer
            customer_id = None
            if alloc.get("customer") and alloc["customer"].strip():
                cust = await db.fetchrow("SELECT id FROM customers WHERE name ILIKE $1 LIMIT 1", alloc["customer"])
                if cust:
                    customer_id = cust["id"]
                else:
                    cust = await db.fetchrow("INSERT INTO customers (name) VALUES ($1) RETURNING id", alloc["customer"].strip())
                    customer_id = cust["id"]

            await db.fetchrow(
                "INSERT INTO allocations (prefix, block_id, customer_id, status, description, notes) VALUES ($1::cidr, $2::uuid, $3::uuid, $4::alloc_status_t, $5, $6) RETURNING id",
                alloc["prefix"], block_id, customer_id, alloc.get("status", "active"), alloc.get("description", ""), alloc.get("notes", "")
            )
            imported += 1

    # Log
    await db.execute("INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by) VALUES ('ip_blocks', $1::uuid, 'import', $2::jsonb, 'csv_import')",
                     block_id, json.dumps({"imported": imported, "skipped": skipped}))

    return {"block_id": str(block_id), "imported": imported, "skipped": skipped}

# ============================================================
# GLOBAL PING VISIBILITY
# ============================================================
from services.ping_service import icmp_ping_batch, http_ping_batch, full_scan
import platform
import uuid

PING_SCHEDULER_LOCK = asyncio.Lock()
PING_IS_RUNNING = False
PING_LAST_SCAN = None
PING_PROGRESS = {"scanned": 0, "total": 0, "eta": None}
PING_SOURCE = platform.node() or "ipam-server"

@app.get("/api/v1/ping/status", summary="Global Ping — latest scan results", tags=["Global Ping"])
async def get_ping_status(
    status: Optional[str] = Query(None, regex="^(online|offline|error|all)$"),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db=Depends(get_db)
):
    """Get latest ping results, filter by status and search IP"""
    global PING_IS_RUNNING, PING_LAST_SCAN

    params = []
    conditions = ["1=1"]
    if status and status != "all":
        params.append(status)
        conditions.append(f"icmp_status = '${len(params)}'")

    if search:
        params.append(f"%{search}%")
        conditions.append(f"ip::text ILIKE '${len(params)}'")

    where = " AND ".join(conditions)
    query = f"""
        SELECT pr.*,
               c.name AS customer_name, a.description AS alloc_desc,
               b.name AS block_name, s.name AS site_name
        FROM ping_results pr
        LEFT JOIN allocations a ON pr.ip::text = split_part(a.prefix::text, '/', 1) AND a.status = 'active'
        LEFT JOIN customers c ON a.customer_id = c.id
        LEFT JOIN ip_blocks b ON a.block_id = b.id
        LEFT JOIN sites s ON b.site_id = s.id
        WHERE {where}
        ORDER BY pr.scanned_at DESC LIMIT ${len(params)+1} OFFSET ${len(params)+2}
    """
    rows = await db.fetch(query, *params, limit, offset)
    total = await db.fetchval(f"SELECT COUNT(*) FROM ping_results pr WHERE {where}", *params)

    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "running": PING_IS_RUNNING,
        "last_scan": PING_LAST_SCAN,
        "scan_progress": PING_PROGRESS if PING_IS_RUNNING else None,
        "limit": limit,
        "offset": offset,
    }

@app.post("/api/v1/ping/run", summary="Global Ping — trigger scan semua active IP", tags=["Global Ping"])
async def run_ping_scan(
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

    # Jalankan scan di background — pakai connection pool baru
    pool_copy = pool  # Ambil pool dari module scope
    background_tasks.add_task(_run_scan_and_save_with_pool, ips)

    return {"status": "started", "total": len(ips), "message": f"Scanning {len(ips)} IPs in background"}

@app.get("/api/v1/ping/history/{ip}", summary="Global Ping — history IP", tags=["Global Ping"])
async def get_ping_history(ip: str, days: int = Query(7, ge=1, le=90), db=Depends(get_db)):
    """Get ping history untuk specific IP"""
    rows = await db.fetch("""
        SELECT * FROM ping_history
        WHERE ip::text = $1 AND checked_at > NOW() - INTERVAL '1 day' * $2
        ORDER BY checked_at DESC LIMIT 500
    """, ip, days)
    return {"items": [dict(r) for r in rows]}

async def _run_scan_and_save_with_pool(ips: list[str]):
    global pool
    """Background task: scan + save + update history — pakai pool sendiri"""
    global PING_IS_RUNNING, PING_LAST_SCAN, PING_PROGRESS
    import time
    from datetime import datetime, timezone

    PING_PROGRESS = {"scanned": 0, "total": len(ips), "eta": None}
    start_time = time.monotonic()

    async with pool.acquire() as db:
        try:
            batch_size = 20
            results = []
            for i in range(0, len(ips), batch_size):
                batch = ips[i:i + batch_size]
                icmp = await icmp_ping_batch(batch)

                for r in icmp:
                    ip = r["ip"]
                    status = r["status"]
                    rtt = r.get("rtt_ms")

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
                        INSERT INTO ping_results (ip, prefix, icmp_status, icmp_rtt, icmp_at, scanned_at, customer_name, block_name, site_name)
                        VALUES ($1::inet, (split_part($1::text, '/', 1) || '/32')::cidr, $2, $3, NOW(), NOW(), $4, $5, $6)
                        ON CONFLICT (ip) DO UPDATE SET icmp_status=$2, icmp_rtt=$3, icmp_at=NOW(), scanned_at=NOW(), customer_name=$4, block_name=$5, site_name=$6
                    """, ip, status, rtt, cust_name, blk_name, sit_name)

                    await db.execute("""
                        INSERT INTO ping_history (ip, status, rtt_ms, source, checked_at)
                        VALUES ($1::inet, $2, $3, 'icmp_local', NOW())
                    """, ip, status, rtt)

                    results.append(r)

                scanned = min(i + batch_size, len(ips))
                elapsed = time.monotonic() - start_time
                rate = scanned / elapsed if elapsed > 0 else 0
                eta = int((len(ips) - scanned) / rate) if rate > 0 else None
                PING_PROGRESS = {"scanned": scanned, "total": len(ips), "eta": eta}

            PING_LAST_SCAN = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            print(f"[PingScan] Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            PING_IS_RUNNING = False
            PING_PROGRESS = {"scanned": 0, "total": 0, "eta": None}

@app.get("/api/v1/ping/summary", summary="Global Ping — summary dashboard", tags=["Global Ping"])
async def get_ping_summary(db=Depends(get_db)):
    """Quick summary counts for dashboard widget"""
    total = await db.fetchval("SELECT COUNT(*) FROM allocations WHERE status = 'active'")
    # Latest scan counts
    latest = await db.fetch("""
        SELECT icmp_status, COUNT(*) as cnt FROM ping_results
        WHERE scanned_at > NOW() - INTERVAL '1 day'
        GROUP BY icmp_status
    """)
    counts = {r["icmp_status"]: r["cnt"] for r in latest}
    return {
        "total_active_ips": total,
        "online": counts.get("online", 0),
        "offline": counts.get("offline", 0),
        "pending": counts.get("pending", 0) or total - sum(counts.values()),
    }
