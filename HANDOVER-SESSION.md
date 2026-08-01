# IPAM v3 — Session Handover

Last updated: 2026-07-29 · Total commits in repo: 183

## Project Structure

```
/opt/database-ipaddresses/          # project root on server floe (103.10.120.11)
├── backend/
│   ├── main.py                     # app entrypoint, global search, audit-logs endpoint, CSV import
│   ├── models/schemas.py           # Pydantic models — ALL enum validation lives here
│   ├── core/
│   │   ├── database.py             # get_db() dependency
│   │   ├── security.py             # get_current_user, require_admin, JWT
│   │   ├── audit.py                # log_audit() + get_client_ip() — shared audit logging
│   │   └── cache.py                # Redis cache helpers
│   ├── api/routes/
│   │   ├── allocations.py          # create/update/delete allocation + auto-rename VLAN + auto-fill site
│   │   ├── blocks.py                # create/update/delete IP block
│   │   ├── customers.py            # create/update/delete customer + /customers/lookup
│   │   ├── vlans.py                 # create/update/delete VLAN + /vlans/lookup
│   │   └── sites.py                 # create/update/delete site
│   ├── tests/                      # pytest suite (59 tests, all passing)
│   │   ├── test_auth.py
│   │   ├── test_validation.py
│   │   ├── test_csv_parser.py
│   │   ├── test_enum_validation.py # NEW this session — regression tests for enum bugs
│   │   └── conftest.py
│   ├── requirements.txt            # SINGLE SOURCE for deps now (Dockerfile reads this)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── constants.js            # NEW this session — OWNER_TYPES/ALLOC_STATUS_OPTS/
│   │   │                           #   BLOCK_STATUS_OPTS/VLAN_STATUS_OPTS single source of truth
│   │   ├── api.js                  # all API call wrappers
│   │   ├── pages/
│   │   │   ├── Customers.jsx
│   │   │   ├── Vlans.jsx
│   │   │   ├── BlockDetail.jsx
│   │   │   ├── Blocks.jsx
│   │   │   ├── AllocModal.jsx      # also contains BlockEditModal, ConfirmModal, SubnetCalc
│   │   │   └── AuditLogs.jsx
│   │   └── components/
│   │       ├── Header.jsx          # topbar incl. global search
│   │       └── ui.jsx              # shared UI primitives (SearchBar, Btn, etc.)
│   ├── tests-e2e/                  # NEW this session — Playwright E2E tests
│   │   ├── helpers.js              # login() helper, reads .env.test
│   │   ├── allocation-owner-type.spec.js
│   │   └── blockdetail-owner-type.spec.js
│   ├── .env.test                   # GITIGNORED — real admin creds, never commit
│   ├── .env.test.example           # template, safe to commit
│   └── playwright.config.js
├── docker/docker-compose.yml       # compose file lives HERE, not project root
├── TESTING.md                      # how to run pytest + Playwright
└── HANDOVER-SESSION.md             # this file
```

## Infrastructure

- Server: `floe` (103.10.120.11), Ubuntu 22.04
- Containers: `ipam-api` (FastAPI, port 8101→8000), `ipam-frontend` (nginx, port 8100→80),
  `ipam-db` (Postgres 16), `ipam-redis`, plus `ipam-grafana`/`ipam-prometheus` (monitoring, not part of IPAM app)
- Repo: `https://github.com/tubagusfiras/IPAM-Project.git` — **push requires a valid PAT in the
  remote URL**; if push fails with "Invalid username or token", the token has expired/been revoked
  and a new one needs generating from GitHub → Settings → Developer settings → Personal access tokens

## How We Work (established pattern this session)

1. **Never use `sed` for file edits** — user explicitly asked to avoid it (risk of corruption).
   All edits go through a small inline Python script using `str.count()` to verify an exact
   match exists (exactly 1) BEFORE writing — if count != 1, abort and inspect exact whitespace
   with `cat -A` or Python `repr()` before retrying. This has caught many close-but-not-exact
   whitespace mismatches (extra blank lines, different indentation) throughout the session.
2. **Check exact strings before patching** — when a patch aborts, get the literal current content
   via `grep -n`, `sed -n 'X,Yp'`, or (most reliably) `python3 -c "print(repr(content[...]))"` to see
   invisible characters/encoding differences (em-dashes in particular caused several failed patches
   — Python's literal `"—"` in a heredoc doesn't always byte-match what's actually in the file).
3. **Backend changes**: edit locally on the server → `docker cp backend/. ipam-api:/app/` to test
   quickly → run pytest → only after tests pass, `git add/commit` → `docker compose build api &&
   docker compose up -d api` (docker compose file is in `docker/` subdirectory, not project root).
4. **Frontend changes**: edit → `cd frontend && npm run build` to catch syntax errors before
   committing → `git add/commit` → `docker compose build frontend && docker compose up -d frontend`.
5. **pytest is now baked into the ipam-api image** (Dockerfile was fixed to read from
   requirements.txt) — no more need to `pip install` pytest manually after every rebuild.
   If it's ever missing again: `docker exec ipam-api pip install --no-cache-dir pytest
   pytest-asyncio httpx time_machine --break-system-packages`.
6. **Token/credential hygiene**: never paste real passwords, API tokens, or `.env.test` contents
   into chat. User edits `.env.test` directly on the server via `nano`.
7. **Database migrations**: always `CREATE TABLE xxx_backup_DATE AS SELECT * FROM xxx;` before any
   bulk UPDATE. Preview with SELECT first, count expected rows, then execute. Log one audit_logs
   entry afterward with `action='import'` summarizing what changed.
8. **Verify command output before proceeding** — don't assume, ask user to paste output and
   read it before deciding the next step. This session repeatedly found bugs this way
   (deploy state, whether patches actually landed, etc).

## Root Cause Pattern Found & Fixed This Session

**The core recurring bug class**: enum-backed values (owner_type, status for allocations/
blocks/vlans) were hardcoded independently in 6+ frontend files, with no single source of
truth. Frontend would offer a dropdown value (e.g. `"infrastructure"`, `"inactive"`,
`"available"`) that didn't exist in the corresponding PostgreSQL enum type, causing 500
errors on save. Fixed by:
- Adding `available` to `block_status_t` enum (was legitimately missing — business need existed)
- Correcting mismatched frontend values to match existing enums (`infrastructure`→`internal`, `inactive`→`reserved`)
- Adding Pydantic `@field_validator` on `status`/`owner_type` fields in `schemas.py` so invalid
  values now get a clean 422 error instead of a raw 500 from Postgres
- Creating `frontend/src/constants.js` as the single source of truth going forward

**Always check for this pattern when something similar surfaces**: `grep -rln "const OWNER_TYPES\|const STATUS_OPTS\|const STATUS_STYLE\|const STATUS_COLOR" frontend/src --include="*.jsx"` — verify any new hardcoded list against `frontend/src/constants.js` and the actual DB enum (`docker exec ipam-db psql -U ipam -d ipam -tAc "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'ENUM_NAME'::regtype;"`).

## What Was Done This Session (chronological summary)

1. Fixed `owner_type="infrastructure"` mismatch (BlockDetail.jsx, IPGrid.jsx) → should be `"internal"`
2. Fixed `vlan status="inactive"` mismatch (Vlans.jsx) → should be `"reserved"`
3. Improved Customers.jsx/Vlans.jsx: server-side source filter, pagination, N+1 query fix
   (batch allocation fetch instead of per-row), debounced search, delete-impact preview
4. Added full audit logging coverage — previously only `allocation`/`user` were logged;
   now `customer`/`vlan`/`block`/`site` CRUD all log to `audit_logs` with IP address tracking
   (`core/audit.py` — `log_audit()` + `get_client_ip()`)
5. Fixed a legacy bug: CSV import + a dead `log_action()` function were writing to a
   different, unused legacy table `audit_log` (singular) instead of `audit_logs` (plural) —
   removed dead code, redirected CSV import logging to the correct table with `action="import"`
6. Redesigned Audit Logs detail view from raw JSON dump to a readable field-by-field diff
   (`computeDiff()`/`resolveDisplay()` in AuditLogs.jsx), resolving UUIDs to names via new
   lightweight `/vlans/lookup` and `/customers/lookup` endpoints (previously capped at 500 rows)
7. Enriched global search (topbar) — added `vlans` as a search category (previously totally
   missing), added VLAN VID matching to allocations search
8. Added `end_device_xc` column to `allocations` table (manual field, distinct from
   Owner/Customer — represents interconnect device topology, not customer info)
9. Built VLAN auto-naming: when an allocation gets a VLAN assigned, if that VLAN has no
   name yet, it's auto-named from the allocation's Owner/Customer value (`_maybe_rename_vlan()`
   in allocations.py). Only fires if VLAN name is currently empty — never overwrites.
10. Backfilled 180 existing VLANs using this same logic (one-time migration, logged in audit_logs)
11. Built VLAN auto-site-fill: same pattern, fills `vlans.site_id` from the allocation's
    block's site, only if VLAN has no site set (`_maybe_fill_vlan_site()`). Backfilled 152
    existing VLANs (1 skipped due to a real `(vid, site_id)` UNIQUE constraint conflict — a
    known pre-existing data quality issue: two separate VLAN rows share VID 3040 with the
    same site, likely should be merged — NOT YET RESOLVED, see pending items)
12. Discovered VLANs can be used across MULTIPLE sites (4 VLANs confirmed: VID 100, 2789,
    1399, 2020) — pivoted from a single `site_id` field to a multi-value `site_names` array
    (same pattern as existing "Router Placements" tags), computed live via subquery, not stored
13. Removed the "Router Placements" column from Vlans.jsx (redundant — same info now shown
    on Customers page), cleaned up now-dead `RouterTags`/`routerMap` code in that file
14. Added `available` to `block_status_t` enum (frontend already offered it in 2 places
    — Blocks.jsx edit modal, AllocModal.jsx — neither matched the DB enum, both fixed)
15. Auto-activate block status: when an allocation is created inside a block, if the block's
    status isn't already `"active"`, it's automatically set to active (block shouldn't stay
    "available"/idle once it has real allocations in it)
16. Refactored `OWNER_TYPES`/`ALLOC_STATUS_OPTS`/`BLOCK_STATUS_OPTS`/`VLAN_STATUS_OPTS` into
    `frontend/src/constants.js` — AllocModal.jsx, BlockDetail.jsx, Blocks.jsx, Vlans.jsx now
    import from there instead of hardcoding. Colors/icons per-page preserved via local style maps.
17. Migrated remaining Pydantic V1 `@validator` → V2 `@field_validator` (SiteIn.name,
    CustomerIn.name/contact_name, VlanIn.vid) — all Pydantic deprecation warnings gone
18. Fixed Dockerfile to install from `requirements.txt` instead of a hand-maintained package
    list — pytest/httpx/time_machine now permanently baked into the image
19. Set up full test infrastructure: 59 pytest tests (backend), 3 Playwright E2E tests
    (frontend, real browser, tests the exact production bug scenario) — see `TESTING.md`
20. Fixed a loading-state bug: "Router Placements" column in Customers.jsx showed an empty
    dash during data fetch instead of a loading skeleton (routerMap[id] was `undefined`
    instead of `null` before fetch completed — RouterTags couldn't distinguish loading from empty)
21. (Separately, by the user/Claude Code outside this chat session — see `git log`) Fixed a
    regression I introduced (`098a134`) where a decorator got misplaced onto a helper function
    during a patch, making `create_allocation` unreachable; also fixed CSV import to properly
    link VLANs to imported allocations, fixed CSV quote-parsing, and stopped inserting DB rows
    for empty/available CSV slots.

## Pending Items (backlog, roughly prioritized)

### High priority / structural
- ~~Refactor constants.js~~ ✅ DONE
- ~~Audit old data vs active enums~~ ✅ DONE — verified clean, Postgres enums prevented any
  invalid data from ever being stored; the bug was 500-errors on save attempts, not bad data at rest
- ~~Migrate Pydantic V1→V2 validators~~ ✅ DONE

### Known data quality issue (NOT YET FIXED)
- **Duplicate VLAN VID 3040**: two separate VLAN rows both have `vid=3040` — one has
  `site_id` set (name "RO-MGMT"), the other doesn't (name "VLAN 3040", generic). This is why
  the site-id backfill skipped 1 row (would have violated the `(vid, site_id)` UNIQUE
  constraint). Needs a decision: merge the two VLAN rows, or is having duplicate VIDs across
  different sites actually valid/intentional in this network? Investigate:
  ```sql
  SELECT id, vid, name, site_id FROM vlans WHERE vid=3040;
  -- then check which allocations point to each of the two VLAN ids
  SELECT * FROM allocations WHERE vlan_id IN ('5df09e44-c365-4520-baba-e474984bfa65', 'd80ff8fc-c9c2-4797-be58-1718cb958190');
  ```

### Medium priority / depends on new pages
- **VlanDetail.jsx / CustomerDetail.jsx** (NEW pages, not yet started) — full detail view
  pages similar to existing BlockDetail.jsx. Should show: full info, ALL related sites/customers/
  VLANs (not truncated "+N more" badges), full allocation/IP table, router placements,
  end_device_xc. This is a PREREQUISITE for the next item below.
- **Cross-link clickable VLAN/Customer names** — currently VLAN badges in Customers.jsx and
  Customer names in Vlans.jsx are plain text, not clickable. Blocked on VlanDetail.jsx/
  CustomerDetail.jsx existing first (nothing to link to yet).
- Loading skeleton audit — only Customers.jsx's Router Placements column was found to have
  the bug (fixed). VLANs/Customer/Site badge columns are populated from the main fetch so
  they're already covered by the existing SkeletonRow. Worth a similar check whenever new
  lazy-loaded columns get added to any page.

### Large scope — recommend dedicated session with fresh context
- **Emoji → SVG icons**: 17 files contain emoji (AuditLogs.jsx, Vlans.jsx, IPScan.jsx,
  AllocModal.jsx, Settings.jsx, Dashboard.jsx, PingTrace.jsx, Sites.jsx, Customers.jsx,
  GlobalPingDetail.jsx, Export.jsx, BlockDetail.jsx, Blocks.jsx, GlobalPing.jsx, Header.jsx,
  Toast.jsx, ui.jsx). User wants all emoji replaced with SVG icons for a more professional
  look. Re-run this to get the current file list:
  ```bash
  grep -rlP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" frontend/src --include="*.jsx"
  ```
- **i18n (ID/EN language toggle)**: user wants all Indonesian-language UI text unified to
  English, OR (preferred) a proper language toggle in Settings with ID/EN options. Files
  confirmed to contain Indonesian text so far (not exhaustive — full audit needed):
  IPScan.jsx, AllocModal.jsx, Settings.jsx. This needs: a translation file structure
  (e.g. `src/i18n/en.json` + `src/i18n/id.json`), a language context/state (persisted,
  e.g. localStorage), a toggle in Settings.jsx, and migrating every hardcoded string.

### Nice-to-have
- Export CSV/Excel feature should include the new columns (end_device_xc, VLAN cross-reference)
  to stay consistent with what's shown in the UI
- Toast/notification feedback after create/update/delete actions (check if this already
  exists somewhere — `components/Toast.jsx` exists but wasn't verified as wired up everywhere)
- `SCHEMA.md` — a quick-reference doc of current DB schema, since it's grown a lot this
  session (new columns: `end_device_xc`, `audit_logs.ip_address/customer_id/vlan_id`, new
  enum value `available` on `block_status_t`, new endpoints `/vlans/lookup`, `/customers/lookup`)

## Auto-Refresh Behavior (clarified this session, not a bug)

The app uses client-side routing (`App.jsx` switch/case on a `route` state) — navigating
between pages fully unmounts/remounts components, which re-fetches fresh data automatically.
So: editing in BlockDetail then navigating to VLANs/Customers via the menu DOES show fresh
data, no manual reload needed. What does NOT auto-refresh: a page left open in another
browser tab/window while data changes elsewhere — there's no WebSocket/polling, so that tab
needs a manual reload or re-navigation to see changes. This was verified from code (`grep`
for setInterval/WebSocket/Context — none found), not assumed.

## Known Uncommitted/Local State to Check First

Run this at the start of the next session to see exactly where things stand:
```bash
cd /opt/database-ipaddresses && git status && git log --oneline -15
```
If there are commits with `Author: Claude Code <claude@anthropic.com>` that aren't from this
chat session, check `git show --stat <hash>` before assuming what they contain — this
happened once already this session (4 unexpected commits fixing CSV import bugs, all
legitimate and non-conflicting, but worth verifying rather than assuming).
