"""
SQLAlchemy engine and session management. Pool sizing mirrors the previous
HikariCP configuration (max 20 / min idle 5). The schema is owned by
/db/schema.sql — the ORM never generates DDL (equivalent of ddl-auto: validate).
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
