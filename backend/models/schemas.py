from typing import Optional
from pydantic import BaseModel, validator, constr, EmailStr

# ── HELPERS ───────────────────────────────────────────
def strip_dangerous(v: str) -> str:
    """Remove characters that could be used for injection."""
    dangerous = ["'", '"', ";", "--", "/*", "*/"]
    for c in dangerous:
        v = v.replace(c, "")
    return v.strip()[:500]

# ── SITES ─────────────────────────────────────────────
class SiteIn(BaseModel):
    name: constr(min_length=1, max_length=200, strip_whitespace=True)
    city: Optional[constr(max_length=100, strip_whitespace=True)] = None
    region: Optional[constr(max_length=100, strip_whitespace=True)] = None
    description: Optional[constr(max_length=1000, strip_whitespace=True)] = None

    @validator("name")
    def sanitize_name(cls, v):
        return strip_dangerous(v)

# ── CUSTOMERS ─────────────────────────────────────────
class CustomerIn(BaseModel):
    name: constr(min_length=1, max_length=200, strip_whitespace=True)
    code: Optional[constr(max_length=50, strip_whitespace=True, pattern=r"^[A-Za-z0-9_-]*$")] = None
    contact_name: Optional[constr(max_length=100, strip_whitespace=True)] = None
    contact_email: Optional[constr(max_length=150, strip_whitespace=True)] = None
    contact_phone: Optional[constr(max_length=30, strip_whitespace=True)] = None
    description: Optional[constr(max_length=1000, strip_whitespace=True)] = None
    is_active: bool = True

    @validator("name", "contact_name")
    def sanitize_text(cls, v):
        return strip_dangerous(v) if v else v

# ── VLANs ─────────────────────────────────────────────
class VlanIn(BaseModel):
    vid: int
    name: Optional[constr(max_length=100, strip_whitespace=True)] = None
    site_id: Optional[str] = None
    status: str = "active"
    description: Optional[constr(max_length=1000, strip_whitespace=True)] = None

    @validator("vid")
    def validate_vid(cls, v):
        if v < 1 or v > 4094:
            raise ValueError("VLAN ID must be between 1 and 4094")
        return v

# ── IP BLOCKS ─────────────────────────────────────────
class BlockIn(BaseModel):
    prefix: constr(max_length=50, strip_whitespace=True)
    name: Optional[constr(max_length=200, strip_whitespace=True)] = None
    asn: Optional[constr(max_length=20, strip_whitespace=True)] = None
    router: Optional[constr(max_length=200, strip_whitespace=True)] = None
    operator: Optional[constr(max_length=200, strip_whitespace=True)] = None
    site_id: Optional[str] = None
    status: str = "active"
    description: Optional[constr(max_length=1000, strip_whitespace=True)] = None

# ── ALLOCATIONS ───────────────────────────────────────
class AllocIn(BaseModel):
    prefix: constr(max_length=50, strip_whitespace=True)
    block_id: str
    customer_id: Optional[str] = None
    vlan_id: Optional[str] = None
    status: str = "active"
    owner_type: str = "customer"
    description: Optional[constr(max_length=1000, strip_whitespace=True)] = None
    notes: Optional[constr(max_length=2000, strip_whitespace=True)] = None

# ── AUTH ──────────────────────────────────────────────
class LoginIn(BaseModel):
    username: constr(min_length=1, max_length=100, strip_whitespace=True)
    password: constr(min_length=1, max_length=256)

class ChangePasswordIn(BaseModel):
    old_password: Optional[constr(max_length=256)] = None
    new_password: constr(min_length=4, max_length=256)

class UserIn(BaseModel):
    username: constr(min_length=1, max_length=100, strip_whitespace=True, pattern=r"^[A-Za-z0-9_]+$")
    email: constr(max_length=150, strip_whitespace=True)
    password: constr(min_length=4, max_length=256)
    role: str = "user"

class UserUpdateIn(BaseModel):
    email: Optional[constr(max_length=150, strip_whitespace=True)] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
