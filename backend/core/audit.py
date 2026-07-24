"""Audit logging — shared across all routers to avoid circular imports with main.py."""
import json
from loguru import logger


async def log_audit(db, action: str, entity_type: str, entity_id, entity_prefix: str,
                     description: str = "", old_data: dict = None, new_data: dict = None,
                     changed_by: str = "admin", ip_address: str = None,
                     customer_id: str = None, vlan_id: str = None):
    """Insert audit log entry. Never raises — logs errors instead so a failed
    audit write never blocks the actual operation it's recording."""
    try:
        await db.execute(
            "INSERT INTO audit_logs (action, entity_type, entity_id, entity_prefix, description, changed_by, old_data, new_data, ip_address, customer_id, vlan_id) "
            "VALUES ($1,$2,$3::uuid,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::uuid,$11::uuid)",
            action, entity_type, str(entity_id) if entity_id else None, entity_prefix,
            description, changed_by,
            json.dumps(old_data, default=str) if old_data else None,
            json.dumps(new_data, default=str) if new_data else None,
            ip_address, customer_id, vlan_id,
        )
    except Exception as e:
        logger.error("Audit log error: {}", e)


def get_client_ip(request) -> str:
    """Extract client IP, respecting X-Forwarded-For if behind a proxy."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None
