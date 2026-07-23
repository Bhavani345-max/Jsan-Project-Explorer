"""
AI enrichment pipeline — the "deep AI integration" layer.

For every ingested tender that hasn't been enriched yet, one OpenRouter call
produces (strict JSON):
  • summary        — 2-3 sentence plain-English brief
  • fit_score      — 0-100 relevance to the COMPANY PROFILE below
  • service_line   — which company pillar it maps to
  • category       — one of the portal's categories (or null)
  • technologies   — technologies genuinely mentioned in the notice
  • tags           — 3-5 short search tags

Results are persisted on the project row (ai_summary / ai_fit_score /
ai_service_line, category resolved by name, technologies get-or-create),
so the Explorer's fit-ranking and the "AI Summary" panel show REAL model
output. Runs from the scheduler after each ingestion cycle, and can be
triggered via POST /api/v1/ai/enrich.
"""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import openrouter
from app.database import SessionLocal
from app.models import Project, ProjectCategory, Technology

log = logging.getLogger("discovery.ai.enricher")

BATCH_LIMIT = 40          # per run — keeps each cycle bounded and cheap

COMPANY_PROFILE = """JSAN Consulting — IT services & consulting.
Core service lines (highest relevance):
  1. Geospatial Intelligence (GIS): GIS platforms, spatial analytics, mapping, land records, field survey.
  2. Telecom & Network Engineering: fibre/OSP design, 5G & RF planning, OSS/BSS, network GIS, broadband rollout.
Secondary service lines:
  3. Digital Engineering: web/mobile/cloud builds, data platforms, AI/ML.
  4. Strategic Workforce Solutions: managed teams, IT staff augmentation.
  5. Structured Program Management: PMO setup, governance, multi-vendor delivery.
Footprint (higher fit): UK (HQ), Germany, India, USA, Malaysia; operating in France, Poland,
Sweden, Norway, Brazil, Canada, Estonia.
NOT a fit (score low): construction/building works, catering, furniture, vehicles, medical
supplies, cleaning, physical goods supply with no IT/GIS/telecom component."""

SYSTEM_PROMPT = f"""You are the opportunity-analysis engine of a business-development portal.
Assess public-sector tender notices for this company:

{COMPANY_PROFILE}

Reply with ONLY a JSON object:
{{
  "summary": "2-3 sentences: what is being procured, scale/budget, who can bid",
  "fit_score": <0-100 integer — relevance to the company profile above>,
  "service_line": "<one of: Geospatial Intelligence | Telecom & Network Engineering | Digital Engineering | Strategic Workforce Solutions | Structured Program Management>",
  "category": "<one of: GIS | AI/ML | Cloud Migration | Web Development | Mobile Development | Data Engineering | Enterprise Software | Cyber Security | DevOps | null>",
  "technologies": ["only technologies genuinely mentioned or clearly required"],
  "tags": ["3-5 short search tags"]
}}
Be strict about fit_score: tenders with no IT/GIS/telecom component score under 20."""

VALID_SERVICE_LINES = {
    "Geospatial Intelligence", "Telecom & Network Engineering", "Digital Engineering",
    "Strategic Workforce Solutions", "Structured Program Management",
}


def build_user_prompt(p: Project) -> str:
    return (
        f"Title: {p.title}\n"
        f"Buyer: {p.organization.name if p.organization else 'Unknown'}\n"
        f"Country: {p.country or 'Unknown'}\n"
        f"Budget: {p.budget_usd} {p.currency or ''}\n"
        f"Deadline: {p.deadline}\n"
        f"Description: {(p.description or '')[:3000]}"
    )


def apply_enrichment(db: Session, p: Project, data: dict) -> bool:
    """Validate + persist one enrichment result. Returns True if applied."""
    summary = str(data.get("summary") or "").strip()
    if not summary:
        return False
    p.ai_summary = summary[:2000]

    try:
        score = int(data.get("fit_score"))
        p.ai_fit_score = max(0, min(100, score))
    except (TypeError, ValueError):
        p.ai_fit_score = None

    line = str(data.get("service_line") or "").strip()
    p.ai_service_line = line if line in VALID_SERVICE_LINES else None

    cat_name = data.get("category")
    if cat_name and p.category_id is None:
        cat = db.scalars(
            select(ProjectCategory).where(ProjectCategory.name == str(cat_name))
        ).first()
        if cat:
            p.category_id = cat.id

    techs = data.get("technologies") or []
    if isinstance(techs, list):
        for name in {str(t).strip()[:80] for t in techs if str(t).strip()}:
            tech = db.scalars(select(Technology).where(Technology.name == name)).first()
            if tech is None:
                tech = Technology(name=name, category="AI-extracted")
                db.add(tech)
                db.flush()
            if tech not in p.technologies:
                p.technologies.append(tech)

    tags = data.get("tags") or []
    if isinstance(tags, list) and tags:
        merged = list(dict.fromkeys((p.tags or []) + [str(t)[:60] for t in tags[:5]]))
        p.tags = merged[:10]
    return True


def enrich_pending(limit: int = BATCH_LIMIT) -> dict:
    """Enrich up to `limit` projects lacking an AI summary. Returns counters."""
    if not openrouter.enabled():
        return {"enabled": False, "enriched": 0, "failed": 0, "pending": None}

    db = SessionLocal()
    enriched = failed = 0
    try:
        batch = list(db.scalars(
            select(Project)
            .where(Project.ai_summary.is_(None), Project.deleted_at.is_(None))
            .order_by(Project.publication_date.desc())
            .limit(limit)
        ))
        for p in batch:
            data = openrouter.chat_json(SYSTEM_PROMPT, build_user_prompt(p))
            if data and apply_enrichment(db, p, data):
                enriched += 1
                db.commit()          # commit per item — a late failure loses nothing
            else:
                failed += 1
        pending = db.scalar(
            select(Project.id).where(
                Project.ai_summary.is_(None), Project.deleted_at.is_(None)
            ).limit(1)
        )
        return {"enabled": True, "enriched": enriched, "failed": failed,
                "more_pending": pending is not None}
    finally:
        db.close()
