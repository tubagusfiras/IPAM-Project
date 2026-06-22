from typing import Optional
from pydantic import BaseModel

class SiteIn(BaseModel):
    name: str
    city: Optional[str] = None
    region: Optional[str] = None
    description: Optional[str] = None

class CustomerIn(BaseModel):
    name: str
    code: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True

class VlanIn(BaseModel):
    vid: int
    name: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None

class BlockIn(BaseModel):
    prefix: str
    name: Optional[str] = None
    asn: Optional[str] = None
    router: Optional[str] = None
    operator: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None

class AllocIn(BaseModel):
    prefix: str
    block_id: str
    customer_id: Optional[str] = None
    vlan_id: Optional[str] = None
    status: str = "active"
    owner_type: str = "customer"
    description: Optional[str] = None
    notes: Optional[str] = None

class LoginIn(BaseModel):
    username: str
    password: str

class ChangePasswordIn(BaseModel):
    old_password: Optional[str] = None
    new_password: str

class UserIn(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"

class UserUpdateIn(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
