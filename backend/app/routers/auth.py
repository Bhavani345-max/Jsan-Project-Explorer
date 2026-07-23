"""
Authentication endpoints (public, like the previous /api/v1/auth/** rule).
Verifies BCrypt credentials against the `users` table and issues an HS256
JWT carrying the user's role for RBAC.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse
from app.security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

# Constant-work comparison target for unknown users — equalizes bcrypt timing
# so the response time doesn't reveal whether an email is registered.
_DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")


@router.post("/login", response_model=TokenResponse, response_model_by_alias=True)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalars(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    ).first()
    password_ok = verify_password(
        body.password, user.password_hash if user else _DUMMY_HASH
    )
    if user is None or not user.is_active or not password_ok:
        # Single generic message — never reveal which part failed.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return TokenResponse(
        access_token=create_token(user.id, user.email, user.role.name),
        expires_in_minutes=get_settings().jwt_ttl_minutes,
    )
