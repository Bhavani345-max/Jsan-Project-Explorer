"""
Stateless JWT security with role-based access control — the Python
equivalent of the Spring Security resource-server configuration.

  • HS256 tokens signed with JWT_SECRET (same env var as before)
  • BCrypt password hashing (compatible with the `users.password_hash` column)
  • `require_roles(...)` dependency == method-level @PreAuthorize RBAC
"""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

ALGORITHM = "HS256"

# All five roles seeded in db/schema.sql, normalized (upper snake case).
ALL_ROLES = (
    "ADMINISTRATOR",
    "BUSINESS_DEVELOPMENT",
    "SALES_TEAM",
    "MANAGER",
    "READ_ONLY",
)

_bearer = HTTPBearer(auto_error=False)


def normalize_role(name: str) -> str:
    """'Business Development' → 'BUSINESS_DEVELOPMENT'."""
    return name.strip().upper().replace(" ", "_").replace("-", "_")


# ---- passwords ---------------------------------------------------------
def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except ValueError:
        return False


# ---- tokens ------------------------------------------------------------
def create_token(user_id: uuid.UUID, email: str, role: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "roles": [normalize_role(role)],
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---- FastAPI dependencies ---------------------------------------------
def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Equivalent of `isAuthenticated()` — any valid bearer token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


def require_roles(*roles: str):
    """Equivalent of @PreAuthorize("hasAnyRole(...)")."""

    def dependency(claims: dict = Depends(get_current_user)) -> dict:
        granted = {normalize_role(r) for r in claims.get("roles", [])}
        if granted.isdisjoint(roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return claims

    return dependency
