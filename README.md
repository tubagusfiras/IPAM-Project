# IPAM SDI — IP Address Management System

Production-ready IPAM system for ISP network management.  
Built for **PT Sumber Data Indonesia** (ASN 56246).

**Version:** 2.1.0 | **Status:** 🟢 Production Active

---

## Quick Start

```bash
# Clone
git clone https://github.com/sdi/ipam.git && cd ipam

# Setup
cp .env.example .env
# Edit .env with your credentials

# Start
docker compose -f docker/docker-compose.yml up -d

# Access
# Frontend:  http://<server-ip>:8100
# API Docs:  http://<server-ip>:8101/docs
# Grafana:   http://<server-ip>:3100
# Prometheus: http://<server-ip>:9090
```

---

## Features

### Core IPAM
| Feature | Description |
|---------|-------------|
| IP Blocks | IPv4/IPv6 blocks with CIDR types and GiST indexes |
| Allocations | Customer IP assignments with VLAN mapping |
| Customers | Customer database with contact info |
| VLANs | VLAN management per site |
| Sites | Multi-site topology tracking |

### Tools
| Feature | Description |
|---------|-------------|
| IP Scan | Background network discovery (ping + TCP probe) |
| Ping & Traceroute | SSE-streamed network diagnostics with MTR |
| Global Ping | Multi-region ICMP + HTTP monitoring |
| CSV Import | Bulk import from legacy formats |
| Export | Excel (styled) + PDF (dark/light theme) |
| Subnet Calculator | CIDR subnet splitting tool |
| Audit Logs | Full change history with old/new data diff |

### Dashboard
- Utilization gauge (IPv4/IPv6 separate)
- Allocation status pie chart
- Network utilization bar chart
- Recent networks table
- Global ping status
- Grafana embed (API metrics)
- Quick action buttons

---

## Architecture

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | FastAPI 0.141 + asyncpg + Redis |
| Frontend | React 18 + Vite 5 + Tailwind CSS + Recharts |
| Database | PostgreSQL 16 (CIDR types, GiST indexes) |
| Cache | Redis 7 (scan sessions, dashboard cache) |
| Monitoring | Prometheus + Grafana |
| Deployment | Docker Compose (6 services) |

### Docker Services
| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| API | ipam-api | 8101→8000 | FastAPI backend |
| Frontend | ipam-frontend | 8100→80 | React SPA (nginx) |
| Database | ipam-db | internal | PostgreSQL 16 |
| Redis | ipam-redis | internal | Session cache |
| Prometheus | ipam-prometheus | 9090 | Metrics collection |
| Grafana | ipam-grafana | 3100 | Metrics dashboard |

### Project Structure
```
/opt/database-ipaddresses/
├── backend/
│   ├── main.py                    # FastAPI app (1,412 lines, modular)
│   ├── api/routes/                # Route modules (auth, blocks, etc.)
│   ├── core/                      # Config, security, database, cache
│   ├── models/                    # Pydantic schemas
│   ├── services/                  # Business logic (csv_parser, export)
│   ├── schema.sql                 # Database schema
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Main app + routing
│   │   ├── pages/                 # 20 page components
│   │   ├── components/            # UI components (ui.jsx, Sidebar, Header)
│   │   ├── api.js                 # API client
│   │   └── index.css              # CSS variables + responsive rules
│   ├── nginx.conf
│   └── Dockerfile
├── docker/
│   └── docker-compose.yml         # 6-service stack
├── monitoring/
│   ├── prometheus.yml
│   ├── dashboards/                # Grafana dashboards
│   └── datasources/
├── scripts/
│   ├── backup.sh                  # Automated DB backup
│   └── restore.sh                 # DB restore
├── data/csv/                      # Sample CSV files
├── tests/                         # pytest test suite (44 tests)
├── .env.example                   # Environment template
└── README.md
```

### Database Schema
- **9 tables:** sites, customers, ip_blocks, vlans, allocations, audit_log, users, api_keys, scan_sessions
- **2 views:** v_block_summary, v_allocation_detail
- **30 indexes:** GiST for CIDR queries, B-tree for foreign keys
- **5 enums:** ip_version_t, block_status_t, alloc_status_t, owner_type_t, vlan_status_t
- **Audit trail:** JSONB old/new data with auto-updated timestamps

---

## Configuration

### Environment Variables
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
```

Generate JWT_SECRET:
```bash
openssl rand -hex 32
```

### Network Ports
| Port | Service | Access |
|------|---------|--------|
| 8100 | Frontend | Public |
| 8101 | API | Public |
| 3100 | Grafana | Public |
| 9090 | Prometheus | Internal recommended |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis | Internal only |

---

## API Documentation

**Interactive docs:** `http://<server-ip>:8101/docs` (Swagger UI)  
**Alternative docs:** `http://<server-ip>:8101/redoc`

### Endpoints

**Auth:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login (rate limited: 5/min) |
| GET | `/api/v1/auth/me` | Current user info |
| POST | `/api/v1/auth/change-password` | Change password |

**IP Blocks:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/blocks` | List blocks (paginated, filterable) |
| POST | `/api/v1/blocks` | Create block |
| GET | `/api/v1/blocks/{id}` | Block detail + allocations |
| PUT | `/api/v1/blocks/{id}` | Update block |
| DELETE | `/api/v1/blocks/{id}` | Delete block |

**Allocations / Customers / VLANs / Sites:** Same CRUD pattern.

**Tools:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/scan/start` | Start IP scan |
| GET | `/api/v1/scan/status/{id}` | Scan progress |
| GET | `/api/v1/ping-trace/ping` | Ping (SSE stream) |
| GET | `/api/v1/ping-trace/traceroute` | Traceroute (SSE stream) |

**Export:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/export/block/{id}` | Excel report |
| GET | `/api/v1/export/block/{id}/pdf` | PDF report (theme=dark/light) |
| POST | `/api/v1/export/blocks` | Multi-block Excel |

---

## Development

### Prerequisites
- Docker + Docker Compose v2+
- Python 3.11+ (for local dev)
- Node.js 18+ (for frontend dev)

### Backend (Local)
```bash
cd backend
pip install -r requirements.txt

export DATABASE_URL="postgresql://ipam:ipam@localhost:5433/ipam"
export REDIS_URL="redis://localhost:6380/0"
export JWT_SECRET="dev-secret"
export ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8100"

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Local)
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run build        # Output: frontend/dist/
```

### Database
```bash
# Access
docker exec -it ipam-db psql -U ipam -d ipam

# Re-apply schema
docker exec -i ipam-db psql -U ipam -d ipam < backend/schema.sql

# Backup
docker exec ipam-db pg_dump -U ipam ipam | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip -c backup.sql.gz | docker exec -i ipam-db psql -U ipam -d ipam
```

---

## Testing

### Automated Tests
```bash
# Run all tests
JWT_SECRET=test-secret python3 -m pytest tests/ -v

# Run specific test file
JWT_SECRET=test-secret python3 -m pytest tests/test_csv_parser.py -v

# With coverage
JWT_SECRET=test-secret python3 -m pytest tests/ --cov=. --cov-report=term-missing
```

### Test Coverage
- **44 tests** covering: CSV parser, auth, validation
- **Framework:** pytest + asyncpg + httpx
- **Target:** 80%+ coverage

### Manual Testing
```bash
# Health check
curl http://localhost:8101/health

# Security headers check
curl -I http://localhost:8101/health | grep -E "X-Content|X-Frame|X-XSS"

# Rate limiting test (6 attempts, last should be 429)
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8101/api/v1/auth/login \
    -H "Content-Type: application/json" -d '{"username":"test","password":"test"}'
  echo ""
done
```

---

## Deployment

### Production Checklist
- [ ] Generate strong JWT_SECRET: `openssl rand -hex 32`
- [ ] Set strong POSTGRES_PASSWORD
- [ ] Configure ALLOWED_ORIGINS (no wildcard `*`)
- [ ] Setup automated backups: `crontab -e` → `0 2 * * * /opt/database-ipaddresses/scripts/backup.sh`
- [ ] Verify monitoring (Grafana at :3100, Prometheus at :9090)
- [ ] Review security headers (X-Content-Type-Options, X-Frame-Options, etc.)

### Docker Commands
```bash
# Build (with cache)
docker compose -f docker/docker-compose.yml build

# Start
docker compose -f docker/docker-compose.yml up -d

# Rebuild + restart (single service)
docker compose -f docker/docker-compose.yml build api
docker compose -f docker/docker-compose.yml up -d api

# View logs
docker compose -f docker/docker-compose.yml logs -f api

# Stop all
docker compose -f docker/docker-compose.yml down
```

### Backup
```bash
# Automated (daily at 2 AM)
crontab -e
0 2 * * * /opt/database-ipaddresses/scripts/backup.sh >> /var/log/ipam/backup.log 2>&1

# Manual
/opt/database-ipaddresses/scripts/backup.sh

# Restore
/opt/database-ipaddresses/scripts/restore.sh
```

### Monitoring
```bash
# Container status
docker ps --filter "name=ipam"

# Resource usage
docker stats ipam-api ipam-db ipam-redis ipam-frontend

# Health checks
curl http://localhost:8101/health
curl http://localhost:8101/api/v1/health/detailed
```

---

## Security

### Implemented
- JWT authentication + bcrypt password hashing
- Role-based access control (admin/user)
- API Key support for M2M access
- Rate limiting (5 login attempts/min per IP)
- CORS restriction (env-configurable origins)
- Request ID tracking (X-Request-ID)
- Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
- Input validation (Pydantic models with constraints)
- SQL injection prevention (parameterized queries via asyncpg)

### Audit
See `AUDIT_REPORT.md` for full security audit (30 findings, 11 critical fixed).

---

## Mobile Responsive

### Supported
- **Android:** Chrome, Samsung Internet, Firefox
- **iOS:** Safari, Chrome
- **Tablet:** iPad, Android tablets
- **Desktop:** All modern browsers

### Breakpoints
- Mobile: ≤ 768px
- Tablet: 768px — 1024px
- Desktop: > 1024px

### Mobile Features
- Sidebar drawer (hamburger menu)
- Touch targets minimum 44px (Apple HIG)
- Safe area insets (iPhone notch)
- Input zoom prevention (16px font)
- Modal fullscreen on mobile
- Horizontal scroll tables
- Grid layouts stack vertically

---

## Troubleshooting

**Container won't start:**
```bash
docker logs ipam-api        # Check API logs
docker logs ipam-frontend   # Check frontend logs
# Common: JWT_SECRET not set → add to .env
```

**Database connection error:**
```bash
docker exec ipam-db pg_isready -U ipam   # Check DB health
# If DB is down:
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
```

**Rate limiting stuck:**
```bash
docker exec ipam-redis redis-cli FLUSHDB   # Clear rate limit cache
```

**Layout issues on mobile:**
- Hard refresh: Ctrl+F5 (desktop) or pull-to-refresh (mobile)
- Clear browser cache if persistent

---

## Documentation

| File | Description |
|------|-------------|
| README.md | This file — project overview |
| PROGRESS.md | Completed work tracker |
| IMPROVEMENTS.md | 21 improvement roadmap |
| AUDIT_REPORT.md | Security audit (30 findings) |
| CSV_PATTERNS.md | CSV import format analysis |
| CLAUDE.md | Project context for AI assistants |
| TESTING.md | Test documentation |
| HANDOVER-SESSION.md | Session handoff notes |

---

## Support

- **Contact:** Firas (firas@sdi.net.id)
- **Company:** PT Sumber Data Indonesia (ASN 56246)
- **GitHub:** https://github.com/sdi/ipam

---

**Version:** 2.1.0 | **Last Updated:** 2026-08-02 | **License:** Internal Use Only
