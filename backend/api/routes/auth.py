from fastapi import APIRouter, HTTPException, Depends, Request

from core.config import JWT_EXPIRE_HOURS
from core.database import get_db
from core.security import get_current_user, require_admin, create_jwt_token, check_password, hash_password
from core.audit import log_audit
from core.rate_limit import limiter
from models.schemas import LoginIn, ChangePasswordIn, UserIn, UserUpdateIn

router = APIRouter(tags=["Authentication"])


# ── LOGIN ────────────────────────────────────────────────────

@router.post("/api/v1/auth/login", summary="Login with username/password")
@limiter.limit("5/minute")  # Rate limit: 5 login attempts per minute per IP
async def login(request: Request, body: LoginIn, db=Depends(get_db)):
    user = await db.fetchrow(
        "SELECT * FROM users WHERE username=$1 AND is_active=true", body.username
    )
    if not user or not check_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")

    await db.execute("UPDATE users SET last_login_at=NOW() WHERE id=$1::uuid", user["id"])
    token = create_jwt_token(user["id"], user["username"], user["role"])

    return {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
        },
        "expires_in_hours": JWT_EXPIRE_HOURS,
    }


# ── CURRENT USER ─────────────────────────────────────────────

@router.get("/api/v1/auth/me", summary="Current user info")
async def get_me(current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    user = await db.fetchrow("SELECT id, username, email, role, last_login_at FROM users WHERE id=$1::uuid", current_user["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    return dict(user)


# ── CHANGE PASSWORD ──────────────────────────────────────────

@router.post("/api/v1/auth/change-password", summary="Change password")
async def change_password(body: ChangePasswordIn, current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    user = await db.fetchrow("SELECT * FROM users WHERE id=$1::uuid", current_user["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    # Admin bisa skip old_password check untuk reset user lain, tapi untuk self-change tetap perlu old_password
    if body.old_password and not check_password(body.old_password, user["password_hash"]):
        raise HTTPException(400, "Old password is incorrect")
    new_hash = hash_password(body.new_password)
    await db.execute("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2::uuid", new_hash, current_user["sub"])
    return {"status": "password_changed"}


# ── USER MANAGEMENT (admin only) ─────────────────────────────

@router.get("/api/v1/users", summary="List all users (admin)")
async def list_users(current_user: dict = Depends(require_admin), db=Depends(get_db)):
    rows = await db.fetch("SELECT id, username, email, role, is_active, last_login_at, created_at FROM users ORDER BY created_at")
    return {"items": [dict(r) for r in rows]}


@router.post("/api/v1/users", status_code=201, summary="Create user (admin)")
@limiter.limit("3/minute")
async def create_user(request: Request, body: UserIn, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    existing = await db.fetchrow("SELECT id FROM users WHERE username=$1 OR email=$2", body.username, body.email)
    if existing:
        raise HTTPException(409, "Username or email already exists")
    hashed = hash_password(body.password)
    row = await db.fetchrow(
        "INSERT INTO users (username, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, username, email, role, is_active, created_at",
        body.username, body.email, hashed, body.role
    )
    await log_audit(db, "create", "user", row["id"], body.username, description=f"User created: {body.username}", changed_by=current_user["username"])
    return dict(row)


@router.put("/api/v1/users/{user_id}", summary="Update user (admin)")
async def update_user(user_id: str, body: UserUpdateIn, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    existing = await db.fetchrow("SELECT * FROM users WHERE id=$1::uuid", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    email = body.email if body.email is not None else existing["email"]
    role = body.role if body.role is not None else existing["role"]
    is_active = body.is_active if body.is_active is not None else existing["is_active"]
    row = await db.fetchrow(
        "UPDATE users SET email=$1, role=$2, is_active=$3, updated_at=NOW() WHERE id=$4::uuid RETURNING id, username, email, role, is_active",
        email, role, is_active, user_id
    )
    await log_audit(db, "update", "user", user_id, existing["username"], description=f"User updated: {existing['username']}", changed_by=current_user["username"])
    return dict(row)


@router.delete("/api/v1/users/{user_id}", summary="Delete user (admin)")
async def delete_user(user_id: str, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    if str(user_id) == current_user["sub"]:
        raise HTTPException(400, "Cannot delete your own account")
    existing = await db.fetchrow("SELECT username FROM users WHERE id=$1::uuid", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    await db.execute("DELETE FROM users WHERE id=$1::uuid", user_id)
    await log_audit(db, "delete", "user", user_id, existing["username"], description=f"User deleted: {existing['username']}", changed_by=current_user["username"])
    return {"status": "deleted"}


@router.post("/api/v1/users/{user_id}/reset-password", summary="Reset user password (admin)")
async def reset_user_password(user_id: str, body: ChangePasswordIn, current_user: dict = Depends(require_admin), db=Depends(get_db)):
    existing = await db.fetchrow("SELECT username FROM users WHERE id=$1::uuid", user_id)
    if not existing:
        raise HTTPException(404, "User not found")
    new_hash = hash_password(body.new_password)
    await db.execute("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2::uuid", new_hash, user_id)
    await log_audit(db, "update", "user", user_id, existing["username"], description=f"Password reset by {current_user['username']}", changed_by=current_user["username"])
    return {"status": "password_reset"}
