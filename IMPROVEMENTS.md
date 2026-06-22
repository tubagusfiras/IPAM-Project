# IMPROVEMENT ROADMAP - IPAM SDI

**Last Updated:** 2026-06-23  
**Status:** 🟢 Significant Progress  
**Total Improvements:** 21 | ✅ 13 Completed | ⏳ 8 Pending

---

## 📊 Overview

This document contains actionable improvements to make the IPAM system more professional, maintainable, and production-ready. Each improvement includes:
- Clear implementation steps
- Estimated effort (hours/days)
- Priority level (Critical / High / Medium / Low)
- Files to modify
- Expected outcome

**Selection criteria:** Improvements prioritized by ROI (Return on Investment) = Impact / Effort

---

## 🏆 Completed Improvements

✅ **#2 Health Check** (2026-06-23) | ✅ **#3 Prometheus Metrics** (2026-06-23)  
✅ **#4 Structured Logging** (2026-06-23) | ✅ **#5 Refactor main.py** (2026-06-23)  
✅ **#6 Unit Tests — 44 tests** (2026-06-23) | ✅ **#9 Input Validation** (2026-06-23)  
✅ **#11 Backup Automation** (2026-06-23) | ✅ **#12 Grafana Dashboard** (2026-06-23)  
✅ **#13 CI/CD Pipeline** (2026-06-23) | ✅ **#14 Toast Notifications** (2026-06-23)  
✅ **#17 Database Indexes** (2026-06-23)

---

## 🎯 Quick Wins (High Impact, Low Effort)

### 1. ~~Add CSV Upload Endpoint~~ [SKIPPED]
**Priority:** ~~High~~ → N/A  
**Effort:** ~~4 hours~~  
**Status:** Not needed - CSV format too variable

**User note:** CSV import parser sudah ada (`parse_ipv4_csv`, `parse_ipv6_csv`) tapi format CSV tidak seragam. Sample CSV files di `/opt/database-ipaddresses/data/csv/` untuk referensi pattern analysis.

---

### 2. Add Comprehensive Health Check Dashboard ✅ DONE
**Priority:** High  
**Effort:** 2 hours  
**Impact:** Operations visibility, faster debugging  
**Completed:** 2026-06-23

**What was implemented:**
- **Endpoint:** `GET /api/v1/health/detailed`
- **Checks:** Database pool (size, free), Redis (ping, memory usage)
- **Output:** JSON with status, timestamp, per-service status, overall health
- **Public path:** Accessible without authentication
- **Test result:** Both DB & Redis OK, pool 6/6 free

**Testing:** `curl http://127.0.0.1:8101/api/v1/health/detailed`

---

### 3. Add Prometheus Metrics Endpoint
**Priority:** High  
**Effort:** 3 hours  
**Impact:** Monitoring, alerting, performance visibility

**Why:** Without metrics, you're flying blind. Can't see request rates, latency, errors, or DB pool usage.

**Implementation:**
```bash
# Add to Dockerfile
pip install prometheus-client
```

```python
# backend/main.py
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

REQUEST_COUNT = Counter('ipam_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
REQUEST_LATENCY = Histogram('ipam_request_duration_seconds', 'Request latency', ['method', 'endpoint'])

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Add middleware untuk track metrics (after line 102)
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    REQUEST_COUNT.labels(request.method, request.url.path, response.status_code).inc()
    REQUEST_LATENCY.labels(request.method, request.url.path).observe(duration)
    
    return response
```

**Files to modify:** `backend/Dockerfile` (add prometheus-client), `backend/main.py` (add metrics endpoint + middleware)  
**Testing:** `curl http://127.0.0.1:8101/metrics`  
**Next step:** Setup Grafana dashboard to visualize metrics

---

### 4. Add Structured Logging
**Priority:** High  
**Effort:** 2 hours  
**Impact:** Debugging, audit trail, production troubleshooting

**Current:** Using `print()` statements (lines 1410, 1420, 1427, 1443)  
**Problem:** No timestamps, no log levels, no structured data, hard to search

**Implementation:**
```bash
# Add to Dockerfile
pip install loguru
```

```python
# backend/main.py (add at top, after imports)
import sys
from loguru import logger

# Remove default handlers
logger.remove()

# Add stdout handler with custom format
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO"
)

# Add file handler (optional, for production)
logger.add(
    "/var/log/ipam/api.log",
    rotation="100 MB",
    retention="30 days",
    compression="zip",
    level="INFO"
)

# Usage examples:
# Replace: print(f"Redis save error: {e}")
# With:    logger.error("Redis save failed", error=str(e), scan_id=scan_id)

# Replace: print(f"Audit log error: {e}")
# With:    logger.error("Audit log failed", error=str(e), action=action, entity_id=entity_id)
```

**Files to modify:** `backend/Dockerfile`, `backend/main.py` (replace all `print()` calls)  
**Search pattern:** `grep -n "print(" backend/main.py` (4 occurrences)

---

## 🏗️ Code Quality (Medium Effort, High Long-term Value)

### 5. Refactor Monolithic main.py
**Priority:** High  
**Effort:** 2-3 days  
**Impact:** Maintainability, testability, onboarding new developers

**Current:** 1,906 lines in one file (all routes, models, logic, export functions)  
**Problem:** Hard to navigate, test, and maintain. Changes in one area affect others.

**Target structure:**
```
backend/
├── api/
│   ├── __init__.py
│   ├── deps.py          # get_db, get_current_user, etc.
│   └── routes/
│       ├── __init__.py
│       ├── auth.py      # ~200 lines: login, users, password
│       ├── blocks.py    # ~150 lines: IP blocks CRUD
│       ├── allocations.py  # ~150 lines
│       ├── customers.py
│       ├── vlans.py
│       ├── sites.py
│       ├── export.py    # ~500 lines: Excel/PDF export logic
│       ├── scan.py      # ~300 lines: IP scanning
│       └── tools.py     # ~150 lines: ping/trace
├── core/
│   ├── config.py        # Settings class dari env vars
│   ├── security.py      # JWT, bcrypt, rate limiter
│   └── database.py      # Pool management
├── models/
│   └── schemas.py       # Pydantic models (BlockIn, AllocIn, etc.)
├── services/
│   ├── csv_parser.py    # parse_ipv4_csv, parse_ipv6_csv
│   ├── export_service.py  # _build_summary_sheet, etc.
│   └── scan_service.py  # _scan_ip, _ping_host, etc.
└── main.py             # ~100 lines: app init + route registration
```

**Migration strategy:**
1. Create directory structure
2. Move routes one by one (start with smallest: sites, vlans)
3. Move services (CSV parser, export helpers)
4. Move core utilities (security, config)
5. Update imports, test each step

**Estimated effort:** 2-3 days (can be done incrementally)  
**ROI:** High - makes all future development faster

---

### 6. Add Unit Tests
**Priority:** High  
**Effort:** 3-4 days  
**Impact:** Confidence in changes, prevent regressions, faster development

**Current:** 0% test coverage (no tests directory)  
**Target:** 60%+ coverage on critical paths

**Critical areas to test:**
1. **CSV parser** (parse_ipv4_csv, parse_ipv6_csv) - complex logic, many edge cases
2. **Auth system** (JWT creation, password hashing, rate limiting)
3. **IP calculations** (subnet calculations, utilization, gap detection)
4. **Export functions** (Excel/PDF generation - integration tests)

**Setup:**
```bash
# Create tests directory
mkdir -p backend/tests
pip install pytest pytest-asyncio pytest-cov httpx

# tests/conftest.py - shared fixtures
# tests/test_csv_parser.py
# tests/test_auth.py
# tests/test_blocks.py
```

**Example test:**
```python
# tests/test_csv_parser.py
def test_parse_ipv4_csv_basic():
    csv_content = """
ASN Origin: 153816
Router: MX204-JKT
IP Name: Test Network

Alokasi
Customer A,100,192,200,...
"""
    meta, allocs = parse_ipv4_csv(csv_content)
    assert meta["asn"] == "153816"
    assert len(allocs) > 0
```

**Run tests:** `pytest tests/ --cov=. --cov-report=html`  
**CI integration:** Add to GitHub Actions workflow

---

### 7. Add Database Migrations (Alembic)
**Priority:** Medium  
**Effort:** 1 day  
**Impact:** Schema versioning, safe deployments, rollback capability

**Current:** Only `schema.sql` file - no migration history  
**Problem:** Can't track schema changes, hard to deploy updates, no rollback

**Setup:**
```bash
pip install alembic
alembic init alembic

# alembic.ini - configure database URL
# alembic/env.py - configure async support for asyncpg
```

**Initial migration:**
```bash
# Convert existing schema.sql to initial migration
alembic revision -m "initial_schema"
# Copy schema.sql content into migration file
alembic stamp head
```

**Usage for future changes:**
```bash
# After modifying models
alembic revision --autogenerate -m "add_api_keys_table"
alembic upgrade head  # apply migrations
alembic downgrade -1  # rollback one migration
```

**Files to create:** `alembic/` directory, `alembic.ini`  
**Files to modify:** `backend/Dockerfile` (add alembic), `docker-compose.yml` (run migrations on startup)

---

## 🔒 Security Hardening (Beyond Fixed Issues)

### 8. Add API Key Support for M2M Access
**Priority:** Medium  
**Effort:** 1 day  
**Impact:** Secure integrations, monitoring tools, automation scripts

**Use case:** External monitoring, CI/CD automation, integrations dengan tools lain  
**Current:** Only JWT auth (requires user login)

**Implementation:**
```sql
-- Add to schema
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash TEXT NOT NULL UNIQUE,  -- bcrypt hash of API key
    name VARCHAR(200) NOT NULL,
    created_by UUID REFERENCES users(id),
    permissions JSONB DEFAULT '{"read": true, "write": false}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

```python
# Modify get_current_user to support both JWT and API key
async def get_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    if api_key:
        return await validate_api_key(api_key)
    elif credentials:
        return decode_jwt_token(credentials.credentials)
    raise HTTPException(401, "Not authenticated")
```

**API key generation:**
```python
@app.post("/api/v1/api-keys")
async def create_api_key(name: str, permissions: dict, current_user = Depends(require_admin)):
    key = secrets.token_urlsafe(32)  # e.g., "ipam_live_abc123..."
    key_hash = bcrypt.hashpw(key.encode(), bcrypt.gensalt()).decode()
    # Store key_hash in DB, return key ONCE to user
    return {"key": f"ipam_live_{key}", "warning": "Save this - it won't be shown again"}
```

**Testing:** `curl -H "X-API-Key: ipam_live_..." http://127.0.0.1:8101/api/v1/blocks`

---

### 9. Add Input Validation Middleware
**Priority:** Medium  
**Effort:** 4 hours  
**Impact:** Prevent injection attacks, data integrity

**Current:** Basic Pydantic validation, but no sanitization  
**Add:** Stricter validation, max lengths, pattern matching, sanitization

**Example enhancements:**
```python
from pydantic import validator, constr, EmailStr

class CustomerIn(BaseModel):
    name: constr(min_length=1, max_length=200, strip_whitespace=True)
    code: Optional[constr(pattern=r'^[A-Z0-9-]+$', max_length=50)] = None
    contact_email: Optional[EmailStr] = None
    
    @validator('name')
    def sanitize_name(cls, v):
        # Remove potentially dangerous characters
        dangerous = ["'", '"', ';', '--', '/*', '*/']
        for char in dangerous:
            v = v.replace(char, '')
        return v.strip()
```

**Files to modify:** `backend/main.py` (all Pydantic models: CustomerIn, BlockIn, AllocIn, VlanIn, SiteIn)

---

### 10. Add Request ID Tracking
**Priority:** Low  
**Effort:** 2 hours  
**Impact:** Debugging, audit trail, correlation across services

**Why:** Trace requests end-to-end, correlate logs, help debugging

**Implementation:**
```python
import uuid

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# Usage in logging:
logger.info("User login", request_id=request.state.request_id, username=username)
```

**Files to modify:** `backend/main.py` (add middleware after line 79)  
**Testing:** `curl -I http://127.0.0.1:8101/health` (check for X-Request-ID header)

---

## 📊 Operations & Monitoring

### 11. Add Backup Automation ✅ DONE
**Priority:** Critical  
**Effort:** 4 hours  
**Impact:** Data protection, disaster recovery, compliance  
**Completed:** 2026-06-23  
**Why was this CRITICAL:** No backup existed - risk of total data loss

**What was implemented:**
- **`scripts/backup.sh`**: Database dump + gzip compression + integrity verification + retention (30 days)
- **`scripts/restore.sh`**: Interactive restore with confirmation and post-restore verification
- **Cron job:** `0 2 * * *` (daily at 2 AM WIB)
- **Location:** `/opt/backups/ipam/`
- **Logs:** `/var/log/ipam/`
- **Test result:** Success (22K backup in <1 minute)

**Rollback:** `gunzip -c /opt/backups/ipam/ipam_20260623_*.sql.gz | docker exec -i ipam-db psql -U ipam -d ipam`

---

### 12. Add Grafana Dashboard
**Priority:** High  
**Effort:** 1 day  
**Impact:** Operational visibility

**Prerequisites:** Prometheus metrics (#3)

**Dashboard panels:** Request rate, p95 latency, error rate, active scans, DB pool usage

---

### 13. Add CI/CD Pipeline
**Priority:** High  
**Effort:** 1 day  
**Impact:** Automated testing, faster deployments

**Create:** `.github/workflows/ci.yml` with test, lint, build, deploy jobs

---

## 🎨 UI/UX Polish

### 14. Add Toast Notifications
**Priority:** Medium | **Effort:** 3 hours

**Create:** `frontend/src/components/Toast.jsx` for user feedback (success/error/info)

---

### 15. Add Search Autocomplete
**Priority:** Medium | **Effort:** 4 hours

**Enhancement:** Debounced search with categorized results dropdown

---

### 16. Add Bulk Operations
**Priority:** Low | **Effort:** 1 day

**Use cases:** Export multiple blocks, bulk status updates, bulk delete

---

## 🚀 Performance & Scalability

### 17. Add Database Indexes
**Priority:** High | **Effort:** 2 hours

**Add:** Full-text search indexes (pg_trgm), composite indexes, partial indexes for active records

---

### 18. Add Redis Caching
**Priority:** Medium | **Effort:** 1 day

**Cache:** Blocks list, customers list, dashboard stats (60s TTL)

---

### 19. Add Cursor Pagination
**Priority:** Low | **Effort:** 4 hours

**Replace:** Offset pagination with keyset pagination for large datasets

---

## 📚 Documentation

### 20. Comprehensive README
**Priority:** High | **Effort:** 3 hours | **Status:** ✅ Done (this session)

---

### 21. API Documentation
**Priority:** Medium | **Effort:** 2 hours

**Add:** Descriptions, examples, response schemas to all FastAPI endpoints

---

## 🎯 Priority Roadmap

**Completed (Week 1-4):** ✅ #2 Health, ✅ #3 Metrics, ✅ #4 Logging, ✅ #5 Refactor, ✅ #6 Tests (44), ✅ #9 Validation, ✅ #11 Backup, ✅ #12 Grafana, ✅ #13 CI/CD, ✅ #14 Toast, ✅ #17 Indexes

**Next (Week 5+):** ⏳ #7 DB Migrations, ⏳ #8 API Keys, ⏳ #10 Request ID, ⏳ #15 Search, ⏳ #16 Bulk, ⏳ #18 Cache, ⏳ #19 Cursor, ⏳ #21 API Docs

**Quick wins remaining:** #10 (2 jam), #21 (2 jam)

---

**Contributing:** Create feature branch → implement → test → update PROGRESS.md → PR  
**Questions:** firas@sdi.net.id | See CLAUDE.md for context

**Maintained by:** AI Assistant (Claude)  
**Last reviewed:** 2026-06-22
