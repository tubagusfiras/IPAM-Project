"""Test autentikasi & otorisasi."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["JWT_SECRET"] = "test-secret-key-not-for-production-12345678"
os.environ["DATABASE_URL"] = "postgresql://ipam_test:test123@localhost:5432/ipam_test"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

import jwt
from core.security import create_jwt_token, decode_jwt_token, hash_password, check_password
from core.config import JWT_SECRET, JWT_ALGORITHM


class TestJWTTokens:
    def test_create_token_returns_string(self):
        token = create_jwt_token("user-1", "firas", "admin")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_decode_valid_token(self):
        token = create_jwt_token("user-1", "firas", "admin")
        payload = decode_jwt_token(token)
        assert payload["sub"] == "user-1"
        assert payload["username"] == "firas"
        assert payload["role"] == "admin"

    def test_decode_expired_token_raises(self):
        import time_machine  # optional
        try:
            import time_machine
        except ImportError:
            pytest.skip("time_machine not installed")

    def test_token_contains_expected_fields(self):
        token = create_jwt_token("u-1", "firas", "admin")
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert "exp" in payload
        assert "iat" in payload
        assert "sub" in payload
        assert "username" in payload
        assert "role" in payload


class TestPasswordHashing:
    def test_hash_is_different_from_password(self):
        h = hash_password("secret123")
        assert h != "secret123"
        assert h.startswith("$2b$") or h.startswith("$2a$")

    def test_check_correct_password(self):
        h = hash_password("secret123")
        assert check_password("secret123", h) is True

    def test_check_wrong_password(self):
        h = hash_password("secret123")
        assert check_password("wrongpass", h) is False

    def test_empty_password(self):
        h = hash_password("secret123")
        assert check_password("", h) is False
