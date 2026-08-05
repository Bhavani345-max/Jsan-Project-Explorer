"""
SQLAlchemy engine and session management. Pool sizing mirrors the previous
HikariCP configuration (max 20 / min idle 5). The schema is owned by
/db/schema.sql — the ORM never generates DDL (equivalent of ddl-auto: validate),
so a managed database must be initialised once with db/bootstrap_remote.py.

The URL comes from Settings.sqlalchemy_url, which prefers Railway's injected
DATABASE_URL and falls back to the compose-supplied DB_URL/DB_USER/DB_PASSWORD.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.sqlalchemy_url,
    pool_size=settings.db_pool_size,
    max_overflow=0,
    pool_pre_ping=True,
    # Managed providers close idle connections at their proxy without telling
    # the client; recycling below that window keeps every checkout usable.
    pool_recycle=settings.db_pool_recycle_seconds,
    connect_args={"connect_timeout": 5},   # fail fast instead of hanging
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
