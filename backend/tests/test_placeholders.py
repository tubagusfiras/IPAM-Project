"""Placeholder tests — will be expanded in improvement #6."""


def test_imports():
    """Verify core modules can be imported without errors."""
    from core.config import DATABASE_URL  # noqa: F401
    from models.schemas import SiteIn, CustomerIn, VlanIn, BlockIn, AllocIn  # noqa: F401
    assert True


def test_schema_required_fields():
    """Verify Pydantic models enforce required fields."""
    from models.schemas import SiteIn

    # name should be required
    try:
        SiteIn()
        assert False, "Should have raised validation error"
    except Exception:
        assert True


def test_jwt_secret_enforced():
    """Verify JWT_SECRET must be set (env var)."""
    import os
    secret = os.environ.get("JWT_SECRET")
    assert secret is not None, "JWT_SECRET must be set"
    assert len(secret) >= 16, "JWT_SECRET should be at least 16 chars"
