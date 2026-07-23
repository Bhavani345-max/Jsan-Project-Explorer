"""
Repository for the Project aggregate. Soft-deleted rows are excluded from
every query. Includes the weighted PostgreSQL full-text search over the
GIN-indexed `search_vector`, and the de-duplication lookups used by the
ingestion scheduler.
"""
import uuid
from datetime import date

from sqlalchemy import Select, func, select, text
from sqlalchemy.orm import Session

from app.models import Project


def not_deleted(stmt: Select) -> Select:
    return stmt.where(Project.deleted_at.is_(None))


def find_by_id(db: Session, project_id: uuid.UUID) -> Project | None:
    stmt = not_deleted(select(Project).where(Project.id == project_id)).limit(1)
    return db.scalars(stmt).first()


def find_by_reference_and_date(
    db: Session, reference_number: str, publication_date: date
) -> Project | None:
    """De-duplication lookup used by the ingestion scheduler."""
    stmt = not_deleted(
        select(Project).where(
            Project.reference_number == reference_number,
            Project.publication_date == publication_date,
        )
    )
    return db.scalars(stmt).first()


def exists_by_source_hash(db: Session, source_hash: str) -> bool:
    stmt = not_deleted(
        select(func.count()).select_from(Project).where(
            Project.source_hash == source_hash
        )
    )
    return db.scalar(stmt) > 0


def count(db: Session, *conditions) -> int:
    stmt = not_deleted(select(func.count()).select_from(Project))
    for cond in conditions:
        stmt = stmt.where(cond)
    return db.scalar(stmt)


def search(
    db: Session, *conditions, order_by, offset: int, limit: int
) -> list[Project]:
    stmt = not_deleted(select(Project))
    for cond in conditions:
        stmt = stmt.where(cond)
    stmt = stmt.order_by(order_by).offset(offset).limit(limit)
    return list(db.scalars(stmt).unique())


def full_text_search(
    db: Session, query: str, offset: int = 0, limit: int = 9
) -> list[Project]:
    """Weighted relevance search via the GIN-indexed tsvector column."""
    ts_query = func.plainto_tsquery("english", query)
    stmt = (
        not_deleted(select(Project))
        .where(Project.search_vector.op("@@")(ts_query))
        .order_by(func.ts_rank(Project.search_vector, ts_query).desc())
        .offset(offset)
        .limit(limit)
    )
    return list(db.scalars(stmt).unique())
