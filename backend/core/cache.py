"""Redis cache helper — dipisah dari main.py biar ga circular import."""

import json
from core.config import REDIS_URL
import redis.asyncio as aioredis

redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
CACHE_TTL = 60  # default 60 detik

async def cache_get(key: str):
    try:
        data = await redis_client.get(f"cache:{key}")
        return json.loads(data) if data else None
    except Exception:
        return None

async def cache_set(key: str, data, ttl: int = CACHE_TTL):
    try:
        await redis_client.setex(f"cache:{key}", ttl, json.dumps(data, default=str))
    except Exception:
        pass

async def cache_del(pattern: str):
    try:
        keys = await redis_client.keys(f"cache:{pattern}")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass
