# AUDIT REPORT - IPAM System SDI
**Tanggal Audit:** 2026-06-22  
**Path:** `/opt/database-ipaddresses/`  
**Stack:** FastAPI + React + PostgreSQL + Docker  
**Total Backend LOC:** 1,906 lines

---

## 🔴 CRITICAL ISSUES (Prioritas Tinggi)

### 1. **Credentials Hardcoded di .env File**
- **File:** `.env`
- **Issue:** Password database dan JWT secret dalam plaintext di repository
  ```
  POSTGRES_PASSWORD=IpamStr0ng2025
  JWT_SECRET=d7275131e43905257eb41208b1397a46ebe78a6c9057f4e512be92ebb1e602cc
  ```
- **Risiko:** Jika .env ter-commit ke git, credentials bocor ke siapa saja yang punya akses repo
- **Rekomendasi:**
  - Tambahkan `.env` ke `.gitignore` segera
  - Rotate JWT secret dan database password
  - Gunakan `.env.example` untuk template tanpa values
  - Pertimbangkan secret management (HashiCorp Vault, AWS Secrets Manager)

### 2. **JWT Secret Default Lemah**
- **File:** `backend/main.py:31`
- **Issue:** `JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")`
- **Risiko:** Jika env var tidak di-set, fallback ke string predictable
- **Rekomendasi:**
  - Hapus fallback default, raise error jika JWT_SECRET tidak ada
  - Enforce minimum secret length (min 32 bytes random)

### 3. **SQL Injection Vulnerability via Dynamic Query Building**
- **File:** `backend/main.py:299-306, 353-402`
- **Issue:** Query building dengan f-string interpolation untuk WHERE clause
  ```python
  where = " AND ".join(conditions)
  rows = await db.fetch(f"""
      SELECT ... WHERE {where}
      ...
  """, *params)
  ```
- **Risiko:** Meskipun parameter di-escape via `$N`, struktur query masih dynamically built
- **Status:** MEDIUM risk (masih pakai parameterized queries untuk values, tapi struktur dinamis)
- **Rekomendasi:** Gunakan query builder library (SQLAlchemy Core) atau whitelist conditions

### 4. **Command Injection Risk di Ping/Traceroute**
- **File:** `backend/main.py:1690-1695, 1753-1766`
- **Issue:** User input langsung ke subprocess tanpa shell=False explicit
  ```python
  cmd = ["ping", "-c", str(count), target]
  proc = await asyncio.create_subprocess_exec(*cmd, ...)
  ```
- **Validasi:** Ada regex validation `^[a-zA-Z0-9.\-:]+$` di `_validate_target()` ✓
- **Status:** LOW risk (sudah ada validation)
- **Rekomendasi:** Dokumentasikan security assumption di function docstring

### 5. **CORS Wildcard Allow All Origins**
- **File:** `backend/main.py:69`
- **Issue:** `allow_origins=["*"]` membuka API ke semua origins
- **Risiko:** CSRF attacks, unauthorized API access dari browser
- **Rekomendasi:**
  - Batasi ke specific origins: `["http://localhost:8100", "https://ipam.sdi.id"]`
  - Atau gunakan env var `ALLOWED_ORIGINS`

### 6. **No Rate Limiting**
- **File:** Backend tidak ada rate limiting middleware
- **Risiko:** Brute force attacks ke `/api/v1/auth/login`, DoS via IP scan endpoints
- **Rekomendasi:**
  - Tambahkan slowapi/fastapi-limiter middleware
  - Rate limit login endpoint: 5 attempts per 15 minutes per IP
  - Rate limit scan endpoints: 1 scan per block per hour

---

## 🟡 HIGH PRIORITY (Harus Diperbaiki)

### 7. **No Input Validation di CSV Parser**
- **File:** `backend/main.py:570-690, 691-760`
- **Issue:** Parser menerima arbitrary CSV content tanpa size/complexity limits
- **Risiko:** DoS via massive CSV files, memory exhaustion
- **Rekomendasi:**
  - Tambahkan max file size check (e.g., 10MB)
  - Limit max rows processed (e.g., 10,000 allocations per import)
  - Add timeout untuk parsing operations

### 8. **Passwords Stored via bcrypt - BAIK ✓**
- **File:** `backend/main.py:1827, 1852`
- **Status:** Password hashing menggunakan bcrypt dengan salt ✓
- **Catatan:** Implementation sudah benar

### 9. **No HTTPS Enforcement**
- **File:** `docker/docker-compose.yml:61`
- **Issue:** Frontend exposed di `0.0.0.0:8100` tanpa TLS
- **Risiko:** JWT tokens dan passwords dikirim plaintext over network
- **Rekomendasi:**
  - Setup nginx reverse proxy dengan Let's Encrypt
  - Enforce HTTPS-only, redirect HTTP ke HTTPS
  - Set secure cookie flags untuk sessions

### 10. **Database Credentials di Connection String**
- **File:** `backend/main.py:18`
- **Issue:** `DATABASE_URL` contains username:password
- **Rekomendasi:**
  - Sudah pakai env var ✓
  - Tapi pastikan tidak di-log atau di-print ke stdout

### 11. **No Database Connection Pooling Limits Monitoring**
- **File:** `backend/main.py:64`
- **Issue:** Connection pool `min_size=2, max_size=10` tanpa monitoring
- **Rekomendasi:**
  - Tambahkan health check endpoint yang expose pool stats
  - Alert jika pool exhausted

### 12. **Background Task Error Handling Minimal**
- **File:** `backend/main.py:1493-1537` (IP scan background task)
- **Issue:** Exception dalam `run_scan()` tidak di-handle properly
- **Risiko:** Scan bisa silent fail tanpa notifikasi ke user
- **Rekomendasi:**
  ```python
  try:
      # scan logic
  except Exception as e:
      session["status"] = "failed"
      session["error"] = str(e)
      await _save_scan_to_redis(scan_id)
  ```

---

## 🟢 MEDIUM PRIORITY (Perbaikan Kualitas)

### 13. **Code Structure - Monolithic main.py**
- **File:** `backend/main.py` (1,906 lines dalam 1 file)
- **Issue:** Semua routes, models, business logic dalam 1 file
- **Rekomendasi:**
  ```
  backend/
  ├── api/
  │   ├── routes/
  │   │   ├── auth.py
  │   │   ├── blocks.py
  │   │   ├── allocations.py
  │   │   ├── customers.py
  │   │   └── ...
  │   └── deps.py (dependencies)
  ├── models/
  │   └── schemas.py (Pydantic models)
  ├── services/
  │   ├── scan.py
  │   ├── export.py
  │   └── csv_parser.py
  └── core/
      ├── config.py
      └── security.py
  ```

### 14. **Tidak Ada Unit Tests**
- **File:** Tidak ada directory `tests/`
- **Risiko:** Regressions tidak terdeteksi, refactoring berbahaya
- **Rekomendasi:**
  - Setup pytest untuk backend
  - Minimal test coverage: auth, CSV parser, IP calculations
  - Setup Jest untuk frontend

### 15. **No API Documentation**
- **File:** FastAPI autodocs ada di `/docs` tapi tidak ada custom descriptions
- **Rekomendasi:**
  - Tambahkan docstrings ke semua endpoints
  - Gunakan OpenAPI tags untuk grouping
  - Tambahkan example responses

### 16. **Error Messages Expose Internal Details**
- **File:** Multiple locations, e.g., `backend/main.py:208`
- **Issue:** `raise HTTPException(404, "Site not found")`
- **Risiko:** Information disclosure (database structure, IDs)
- **Rekomendasi:**
  - Generic error messages untuk production
  - Log detail internal errors tapi return generic message ke client
  - Jangan expose stack traces

### 17. **No Logging Infrastructure**
- **File:** Backend hanya pakai `print()` statements
- **Issue:** `backend/main.py:1410, 1420, 1427, 1443`
- **Rekomendasi:**
  - Setup structured logging (loguru atau structlog)
  - Log format: timestamp, level, correlation_id, message
  - Log ke file + stdout untuk Docker

### 18. **Frontend State Management Ad-hoc**
- **File:** `frontend/src/App.jsx`
- **Issue:** State management pakai useState di root component
- **Risiko:** Props drilling, re-renders tidak optimal
- **Rekomendasi:**
  - Pertimbangkan Zustand atau Context API untuk global state
  - Atau minimal extract auth state ke custom hook

### 19. **No Frontend Error Boundaries**
- **File:** `frontend/src/App.jsx` tidak ada error boundary
- **Risiko:** JS error bisa crash seluruh app
- **Rekomendasi:**
  - Wrap lazy loaded routes dengan ErrorBoundary component
  - Show user-friendly error page

### 20. **CSV Parser Logic Complexity**
- **File:** `backend/main.py:580-689` (IPv4 parser ~110 lines)
- **Issue:** Nested loops, complex state machine untuk grouping
- **Risiko:** Hard to test, bugs sulit di-debug
- **Rekomendasi:**
  - Extract ke separate service class
  - Add extensive unit tests dengan sample CSV files
  - Document expected CSV format dengan examples

---

## 🔵 LOW PRIORITY (Nice to Have)

### 21. **Database Schema Design - BAIK ✓**
- **File:** `backend/schema.sql`
- **Kelebihan:**
  - Proper use of CIDR types untuk IP addresses
  - Generated columns untuk ip_version (computed dari family())
  - Proper indexes (GIST untuk CIDR, B-tree untuk foreign keys)
  - Enum types untuk status fields (type safety)
  - Audit log dengan JSONB untuk old/new data
  - Updated_at triggers
- **Minor Issue:**
  - Tidak ada created_by/updated_by untuk audit trail
  - Audit log tidak capture IP address client atau user agent

### 22. **Docker Setup - SOLID ✓**
- **File:** `docker/docker-compose.yml`
- **Kelebihan:**
  - Health checks untuk database
  - Proper volume mounts
  - Redis dengan memory limits
  - Init scripts via docker-entrypoint-initdb.d
- **Rekomendasi Minor:**
  - Tambahkan health checks untuk API service
  - Gunakan Docker secrets untuk credentials (bukan env vars)
  - Multi-stage builds untuk frontend (sudah ada Dockerfile?)

### 23. **Frontend Dependencies - UPDATE NEEDED**
- **File:** `frontend/package.json`
- **Versions:**
  - React 18.2.0 (latest stable ✓)
  - Vite 5.0.0 (update tersedia 5.4.x)
  - Tailwind 3.4.19 (latest ✓)
- **Rekomendasi:**
  - Run `npm audit` untuk check vulnerabilities
  - Update Vite ke latest 5.x

### 24. **API Endpoint Consistency**
- **Issue:** Beberapa endpoints return raw dict, beberapa return `{"items": [...], "total": ...}`
- **File:** `backend/main.py` - inconsistent response formats
- **Rekomendasi:**
  - Standardize pagination format untuk semua list endpoints
  - Always include metadata: `{"data": ..., "meta": {"total", "page", "limit"}}`

### 25. **No Monitoring/Observability**
- **Issue:** Tidak ada health metrics, APM, atau tracing
- **Rekomendasi:**
  - Tambahkan Prometheus metrics endpoint (`/metrics`)
  - Track: request count, latency p50/p95/p99, error rate
  - Setup Grafana dashboard untuk operational visibility

### 26. **Redis Usage - Single Purpose**
- **File:** `backend/main.py:23, 1405-1427`
- **Usage:** Hanya untuk IP scan session persistence
- **Rekomendasi:**
  - Pertimbangkan cache query results (block lists, customer lists)
  - Cache TTL: 5-15 minutes untuk rarely-changing data
  - Implement cache invalidation on writes

### 27. **Backup Strategy Undefined**
- **Issue:** Tidak ada documented backup procedure untuk PostgreSQL
- **Rekomendasi:**
  - Setup automated pg_dump daily
  - Test restore procedure
  - Document RTO/RPO requirements

### 28. **No CI/CD Pipeline**
- **Issue:** Tidak ada `.github/workflows/` atau CI config
- **Rekomendasi:**
  - Setup GitHub Actions untuk:
    - Run tests on PR
    - Lint checks (black, ruff untuk Python; ESLint untuk JS)
    - Build Docker images
    - Deploy to staging on merge to main

### 29. **Frontend Build Optimization**
- **File:** `frontend/vite.config.js` (not reviewed in detail)
- **Rekomendasi:**
  - Verify code splitting configured
  - Check bundle size analysis
  - Lazy load heavy dependencies (recharts, openpyxl equivalents)

### 30. **Documentation Minimal**
- **Issue:** Tidak ada README.md yang comprehensive
- **Rekomendasi:**
  - Tambahkan README.md dengan:
    - Architecture overview
    - Setup instructions
    - Development workflow
    - API endpoints documentation
    - Deployment guide

---

## 📊 SUMMARY METRICS

### Kode Quality
- **Backend Lines of Code:** 1,906 (monolithic)
- **Cyclomatic Complexity:** High (CSV parser, export functions)
- **Test Coverage:** 0% (no tests)
- **Type Safety:** Partial (Pydantic models for input validation)

### Security Posture
- **Authentication:** ✅ JWT + bcrypt
- **Authorization:** ✅ Role-based (admin vs user)
- **Input Validation:** ⚠️ Partial (needs improvement)
- **HTTPS:** ❌ Not enforced
- **Rate Limiting:** ❌ None
- **CORS:** ⚠️ Wildcard (overly permissive)

### Database
- **Schema Design:** ✅ Excellent (proper types, indexes, constraints)
- **Connection Pooling:** ✅ Configured
- **Migrations:** ⚠️ Manual SQL (no Alembic/migration framework)

### Dependencies
- **Backend:** Python 3.11, FastAPI, asyncpg, bcrypt, pyjwt (modern stack ✅)
- **Frontend:** React 18, Vite 5, Tailwind 3 (modern stack ✅)
- **Infrastructure:** PostgreSQL 16, Redis 7, Docker (solid ✅)

---

## 🎯 PRIORITIZED ACTION PLAN

### Sprint 1 (Critical - Week 1)
1. ✅ Tambahkan `.env` ke `.gitignore`
2. ✅ Rotate JWT_SECRET dan database password
3. ✅ Fix CORS policy - restrict origins
4. ✅ Add rate limiting ke login endpoint
5. ✅ Setup HTTPS dengan reverse proxy

### Sprint 2 (High - Week 2-3)
6. ✅ Add input validation limits (CSV file size, max rows)
7. ✅ Improve error handling di background tasks
8. ✅ Setup structured logging
9. ✅ Add health check endpoints
10. ✅ Write unit tests untuk critical paths (auth, CSV parser)

### Sprint 3 (Medium - Week 4-6)
11. ✅ Refactor monolithic main.py ke modular structure
12. ✅ Add API documentation (docstrings, examples)
13. ✅ Setup monitoring/metrics
14. ✅ Implement frontend error boundaries
15. ✅ Add backup automation

### Sprint 4 (Low - Backlog)
16. ✅ Setup CI/CD pipeline
17. ✅ Comprehensive README documentation
18. ✅ Frontend bundle optimization
19. ✅ Redis caching strategy
20. ✅ Database migration framework (Alembic)

---

## 🏆 POSITIVE HIGHLIGHTS

1. **Modern Tech Stack** - FastAPI, React 18, PostgreSQL 16 adalah pilihan solid
2. **Database Schema Excellence** - Proper use of CIDR types, indexes, constraints
3. **Password Security** - bcrypt implementation correct
4. **Docker Containerization** - Clean setup dengan health checks
5. **Feature Completeness** - IPAM core features (blocks, allocations, import/export) well implemented
6. **IP Scanning Innovation** - Background scan dengan Redis persistence adalah nice feature
7. **Export Functionality** - Excel + PDF export dengan styling comprehensive

---

**Overall Assessment:** 🟡 **MEDIUM RISK**

Sistem sudah **production-ready dari sisi functionality**, tapi ada **critical security gaps** yang harus ditutup sebelum deploy ke production environment. Backend code quality solid meskipun monolithic. Database design excellent. Prioritas utama: fix credential management, CORS, rate limiting, dan HTTPS enforcement.

**Estimated Remediation Effort:** 2-3 minggu (1 full-time developer)
