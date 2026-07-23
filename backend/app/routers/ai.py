"""
AI enrichment endpoints. Enrichment mutates data → Administrator only;
status is readable by any authenticated user.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import enricher, openrouter
from app.config import get_settings
from app.database import get_db
from app.models import Project
from app.security import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/ai", tags=["AI"])


@router.get("/status", dependencies=[Depends(get_current_user)])
def status(db: Session = Depends(get_db)):
    base = select(func.count()).select_from(Project).where(Project.deleted_at.is_(None))
    total = db.scalar(base)
    enriched = db.scalar(base.where(Project.ai_summary.is_not(None)))
    return {
        "enabled": openrouter.enabled(),
        "model": get_settings().openrouter_model if openrouter.enabled() else None,
        "totalProjects": total,
        "enriched": enriched,
        "pending": total - enriched,
    }


@router.post("/enrich", dependencies=[Depends(require_roles("ADMINISTRATOR"))])
def enrich(limit: int = Query(default=enricher.BATCH_LIMIT, ge=1, le=200)):
    return enricher.enrich_pending(limit=limit)
