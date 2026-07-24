# Testing Guide

## Backend (pytest)

Run inside the running `ipam-api` container:

```bash
docker exec ipam-api pip install --no-cache-dir pytest pytest-asyncio httpx time_machine --break-system-packages
docker cp backend/. ipam-api:/app/
docker exec ipam-api sh -c "cd /app && python -m pytest tests/ -v"
```

Current coverage: 59 tests (auth, CSV parsing, Pydantic validation, enum validation).

## Frontend E2E (Playwright)

One-time setup:
```bash
cd frontend
npm install -D @playwright/test dotenv
npx playwright install --with-deps chromium
cp .env.test.example .env.test   # then edit with real admin credentials
```

Run tests:
```bash
cd frontend
npx playwright test --reporter=list
```

`.env.test` is gitignored — never commit real credentials.

## Known regression tests

- `backend/tests/test_enum_validation.py` — owner_type/status enum validation
  (regression for the "infrastructure"/"inactive" 500 error incident, 2026-07-24)
- `frontend/tests-e2e/blockdetail-owner-type.spec.js` — same incident, tested
  end-to-end through the real browser UI
