# IPAM SDI - IP Address Management System

Production-ready IPAM system for ISP network management. Built for PT Sumber Data Indonesia (ASN 56246).

**Status:** 🟢 **ALL 21 IMPROVEMENTS COMPLETE** — Security Hardened + Monitored + Automated

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/sdi/ipam.git
cd ipam

# Setup environment
cp .env.example .env
# Edit .env with your credentials (see Configuration section)

# Start services
docker compose -f docker/docker-compose.yml up -d

# Access application
# Frontend: http://103.10.120.11:8100
# API Docs: http://103.10.120.11:8101/docs
# Health: http://103.10.120.11:8101/health
# Grafana: http://103.10.120.11:3100 (admin/admin)
# Prometheus: http://103.10.120.11:9090
```

**Default login:** Create first user via API or use database seed script.

---

## 📋 Features

### Core IPAM
- **IP Block Management** - IPv4/IPv6 blocks with allocation tracking
- **Allocations** - Customer IP assignments with VLAN mapping
- **Customers** - Customer database with contact info
- **VLANs** - VLAN management per site
- **Sites** - Multi-site topology tracking

### Advanced Tools
- **IP Scanning** - Background network discovery (ping + TCP probe)
- **Ping & Traceroute** - SSE-streamed network diagnostics
- **CSV Import** - Bulk import from legacy formats (IPv4/IPv6 parsers)
- **Export** - Excel (styled) + PDF (dark/light theme) reports
- **Audit Logging** - Full change history with old/new data diff

### Security
- **Authentication** - JWT tokens + bcrypt password hashing
- **Authorization** - Role-based (admin/user) + API Key (M2M)
- **Rate Limiting** - 5 login attempts/minute per IP
- **CORS Protection** - Env-configurable allowed origins
- **Session Persistence** - Redis-backed scan sessions
- **Request ID** - X-Request-ID header for traceability

---

## 🏗️ Architecture

### Tech Stack
- **Backend:** FastAPI (Python 3.11) + asyncpg + Redis
- **Frontend:** React 18 + Vite + Tailwind CSS + Recharts
- **Database:** PostgreSQL 16 (CIDR types, GiST indexes)
- **Cache:** Redis 7 (scan sessions)
- **Deployment:** Docker Compose

### Project Structure
```
/opt/database-ipaddresses/
├── backend/
│   ├── main.py              # FastAPI app (1,906 lines)
│   ├── schema.sql           # Database schema
│   ├── Dockerfile           # API container
│   └── migrate_owner_type.sql
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main app + routing
│   │   ├── pages/           # Page components
│   │   └── components/      # UI components
│   ├── package.json
│   └── Dockerfile
├── docker/
│   └── docker-compose.yml   # 4-service stack
├── data/
│   └── csv/                 # Sample CSV files
├── PROGRESS.md              # What's been done
├── IMPROVEMENTS.md          # 21 improvement suggestions
├── AUDIT_REPORT.md          # Security audit findings
└── README.md                # This file
```

### Database Schema
- **7 tables:** sites, customers, ip_blocks, vlans, allocations, audit_log, users
- **3 views:** v_block_summary, v_allocation_detail
- **11 indexes:** GiST for CIDR queries, B-tree for foreign keys
- **5 enums:** ip_version_t, block_status_t, alloc_status_t, owner_type_t, vlan_status_t
- **Audit trail:** JSONB old/new data, auto-updated timestamps

---

## ⚙️ Configuration

### Environment Variables (.env)
```bash
# Database
POSTGRES_DB=ipam
POSTGRES_USER=ipam
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://ipam:<password>@db:5432/ipam

# Redis
REDIS_URL=redis://redis:6379/0

# Security (REQUIRED)
JWT_SECRET=<generate-with-openssl-rand-hex-32>
ALLOWED_ORIGINS=http://localhost:8100,http://your-domain.com

# Optional
LOG_LEVEL=INFO
```

**Generate JWT_SECRET:**
```bash
openssl rand -hex 32
```

### Port Mapping
- **Frontend:** 8100 → 80 (nginx)
- **API:** 8101 → 8000 (uvicorn)
- **Database:** 5433 → 5432 (PostgreSQL)
- **Redis:** 6380 → 6379

---

## 💻 Development

### Prerequisites
- Docker + Docker Compose v2+
- Python 3.11+ (for local dev)
- Node.js 18+ (for frontend dev)

### Backend Development
```bash
cd backend

# Install dependencies
pip install fastapi uvicorn asyncpg python-dotenv python-multipart \
            openpyxl weasyprint redis[hiredis] bcrypt pyjwt slowapi

# Run locally (with local PostgreSQL + Redis)
export DATABASE_URL="postgresql://ipam:ipam@localhost:5433/ipam"
export REDIS_URL="redis://localhost:6380/0"
export JWT_SECRET="dev-secret-change-in-production"
export ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8100"

uvicorn main:app --reload --host 0.0.0.0 --port 8000

# API docs available at http://localhost:8000/docs
```

### Frontend Development
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# Access at http://localhost:3000

# Build for production
npm run build
# Output in frontend/dist/
```

### Database Management
```bash
# Access database
docker exec -it ipam-db psql -U ipam -d ipam

# Run schema
docker exec -i ipam-db psql -U ipam -d ipam < backend/schema.sql

# Backup
docker exec ipam-db pg_dump -U ipam ipam > backup.sql

# Restore
cat backup.sql | docker exec -i ipam-db psql -U ipam -d ipam
```

---

## 🧪 Testing

### Manual Testing
```bash
# Health check
curl http://localhost:8101/health

# Rate limiting test (6 attempts, last should be 429)
for i in {1..6}; do 
  curl -X POST http://localhost:8101/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}'
  echo ""
done

# Dashboard (requires auth)
curl -H "Authorization: Bearer <token>" \
  http://localhost:8101/api/v1/dashboard/stats
```

### Automated Tests (TODO)
```bash
# Backend tests (when implemented)
cd backend
pytest tests/ --cov=. --cov-report=html

# Frontend tests (when implemented)
cd frontend
npm test
```

---

## 🚢 Deployment

### Production Checklist
- [ ] Generate strong JWT_SECRET (32+ bytes random)
- [ ] Set strong POSTGRES_PASSWORD
- [ ] Configure ALLOWED_ORIGINS (no wildcard)
- [ ] Setup HTTPS (nginx + Let's Encrypt)
- [ ] Setup automated backups (see scripts/backup.sh)
- [ ] Configure log rotation
- [ ] Setup monitoring (Prometheus + Grafana recommended)
- [ ] Review security audit (AUDIT_REPORT.md)

### Docker Compose Production
```bash
# Build images
docker compose -f docker/docker-compose.yml build

# Start in background
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f api

# Stop
docker compose -f docker/docker-compose.yml down
```

### Monitoring
```bash
# Container status
docker ps --filter "name=ipam"

# Resource usage
docker stats ipam-api ipam-db ipam-redis ipam-frontend

# Health checks
curl http://localhost:8101/health
curl http://localhost:8101/api/v1/health/detailed  # When implemented
```

---

## 📖 API Documentation

**Interactive docs:** http://localhost:8101/docs (Swagger UI)  
**Alternative docs:** http://localhost:8101/redoc

### Key Endpoints

**Authentication:**
- `POST /api/v1/auth/login` - Get JWT token (rate limited: 5/min)
- `GET /api/v1/auth/me` - Current user info
- `POST /api/v1/auth/change-password` - Change password

**IP Blocks:**
- `GET /api/v1/blocks` - List blocks (paginated, filterable)
- `POST /api/v1/blocks` - Create block
- `GET /api/v1/blocks/{id}` - Block details + allocations
- `PUT /api/v1/blocks/{id}` - Update block
- `DELETE /api/v1/blocks/{id}` - Delete block

**Allocations, Customers, VLANs, Sites:** Similar CRUD pattern

**Tools:**
- `POST /api/v1/scan/start` - Start IP scan
- `GET /api/v1/scan/status/{id}` - Scan progress
- `GET /api/v1/ping-trace/ping` - Ping (SSE stream)
- `GET /api/v1/ping-trace/traceroute` - Traceroute (SSE stream)

**Export:**
- `GET /api/v1/export/block/{id}` - Excel report
- `GET /api/v1/export/block/{id}/pdf?theme=dark` - PDF report
- `POST /api/v1/export/blocks` - Multi-block Excel

---

## 🤝 Contributing

See `IMPROVEMENTS.md` for 21 prioritized improvements.

**Development workflow:**
1. Create feature branch: `git checkout -b feat/feature-name`
2. Implement changes
3. Test locally
4. Update PROGRESS.md with completion status
5. Commit: `git commit -m "feat: description"`
6. Push and create PR

**Commit style:** Conventional Commits (feat, fix, docs, refactor, test, chore)

---

## 📚 Documentation

- **PROGRESS.md** - Completed work tracker (update across sessions)
- **IMPROVEMENTS.md** - 21 improvement roadmap with implementation guides
- **AUDIT_REPORT.md** - Security audit with 30 findings
- **CSV_PATTERNS.md** - CSV import format analysis
- **CLAUDE.md** - Project context for AI assistants

---

## 🐛 Troubleshooting

**Container won't start:**
```bash
# Check logs
docker logs ipam-api

# Common issue: JWT_SECRET not set
# Solution: Add JWT_SECRET to .env
```

**Database connection error:**
```bash
# Check DB health
docker exec ipam-db pg_isready -U ipam

# Reset DB
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
```

**Rate limiting false positives:**
```bash
# Check Redis
docker exec ipam-redis redis-cli KEYS "slowapi:*"

# Clear rate limit cache
docker exec ipam-redis redis-cli FLUSHDB
```

---

## 📞 Support

- **Issues:** Contact Firas (firas@sdi.net.id)
- **Documentation:** See `/opt/database-ipaddresses/*.md`
- **Company:** PT Sumber Data Indonesia (ASN 56246)

---

**Last Updated:** 2026-08-02  
**Version:** 2.1.0  
**License:** Internal Use Only

---

## 📱 Mobile Responsive (v2.1.0)

### Supported Devices
- **Android** — Chrome, Samsung Internet, Firefox
- **iOS** — Safari, Chrome
- **Tablet** — iPad, Android tablets
- **Desktop** — Chrome, Firefox, Safari, Edge

### Mobile Features
- **Sidebar drawer** — Hidden by default, hamburger menu to open
- **Touch targets** — Minimum 44px (Apple HIG compliant)
- **Safe area insets** — iPhone notch/home indicator support
- **Input zoom prevention** — 16px font-size prevents iOS auto-zoom
- **Modal fullscreen** — Modals take full screen on mobile
- **Horizontal scroll** — Tables scroll horizontally on mobile
- **Grid collapse** — Dashboard grids stack vertically on mobile

### Responsive Breakpoints
- **Mobile:** ≤ 768px
- **Tablet:** 768px — 1024px
- **Desktop:** > 1024px

---

## 🔒 Security Headers (v2.1.0)

### HTTP Response Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Purpose
| Header | Prevents |
|--------|----------|
| X-Content-Type-Options | MIME sniffing attacks |
| X-Frame-Options | Clickjacking via iframes |
| X-XSS-Protection | Cross-site scripting (legacy browsers) |
| Referrer-Policy | URL path leakage to third parties |
| Permissions-Policy | Camera/microphone/geolocation abuse |

---

## 🛠️ Development with ECC (Everything Claude Code)

### Installed Skills (50 total)
**Core Skills:** api-design, backend-patterns, coding-standards, e2e-testing, error-handling, eval-harness, frontend-patterns, security-review, strategic-compact, tdd-workflow, verification-loop, etc.

**Niche Skills:** python-patterns, python-testing, django-patterns, django-security, postgres-patterns, continuous-learning, continuous-learning-v2, iterative-retrieval, deep-research, exa-search, etc.

**Rules:** common (10 files), python (6 files)

### AI Assistant Workflow
1. **Planning:** Use `planner` agent for complex features
2. **TDD:** Write tests first with `tdd-guide` agent
3. **Code Review:** Use `code-reviewer` agent after writing code
4. **Security:** Use `security-reviewer` agent for auth/input handling
5. **Verification:** Run `verification-loop` before commits

---

## 🔧 Recent Changes (v2.1.0)

### 2026-08-02
- ✅ Security headers middleware (X-Content-Type-Options, X-Frame-Options, etc.)
- ✅ Mobile responsive overhaul (sidebar drawer, grid collapse, touch targets)
- ✅ Header full-width on mobile (fixed left offset)
- ✅ Viewport meta tags for iOS/Android
- ✅ Safe area insets for iPhone notch
- ✅ Modal fullscreen on mobile
- ✅ Touch targets 44px minimum (Apple HIG)
- ✅ ECC skills installation (50 skills, 3 rule dirs)

### 2026-06-24
- ✅ All 21 improvements completed
- ✅ Security audit (30 findings, 11 critical fixed)
- ✅ Code refactoring (main.py 1994→1412 lines)
- ✅ Unit tests (44 tests passing)
- ✅ CI/CD pipeline (GitHub Actions)

---

## 📊 Project Metrics

### Codebase
- **Backend:** 1,412 lines (modular — api/, core/, models/, services/)
- **Frontend:** ~20 pages (React components with lazy loading)
- **Database:** 9 tables, 3 views, 30 indexes
- **Docker:** 6 services, 1 network, 3 volumes

### Security Audit
- **Total findings:** 30
- **Critical fixed:** 11/11
- **Security headers:** 5 implemented
- **Rate limiting:** 5 attempts/min on login

### Test Coverage
- **Current:** 44 tests (CSV parser, auth, validation)
- **Framework:** pytest + asyncpg + httpx
- **Target:** 80%+ coverage
