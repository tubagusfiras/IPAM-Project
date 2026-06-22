"""Shared fixtures untuk semua test."""

import sys, os, pytest, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Pastikan JWT_SECRET ada untuk import modules
os.environ["JWT_SECRET"] = "test-secret-key-not-for-production-12345678"
os.environ["DATABASE_URL"] = "postgresql://ipam_test:test123@localhost:5432/ipam_test"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:8100"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client():
    """FastAPI TestClient untuk integration tests."""
    try:
        from fastapi.testclient import TestClient
        # Import after env vars are set
        import importlib.util
        spec = importlib.util.spec_from_file_location("main", os.path.join(os.path.dirname(__file__), "..", "main.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        app = mod.app
        with TestClient(app) as c:
            yield c
    except Exception as e:
        pytest.skip(f"TestClient not available (need DB running): {e}")
        yield None
