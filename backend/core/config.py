import os
from fastapi.middleware.cors import CORSMiddleware

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ipam:ipam@db:5432/ipam")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable must be set")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8
SCAN_TTL = 60 * 60 * 24  # 24 jam
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8100,http://localhost:3000").split(",")
