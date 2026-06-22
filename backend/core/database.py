import asyncpg

pool = None

async def get_db():
    async with pool.acquire() as conn:
        yield conn
