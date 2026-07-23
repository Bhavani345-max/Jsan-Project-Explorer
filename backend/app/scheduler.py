"""
Data-collection scheduler (APScheduler). Runs connectors on three cadences
and performs idempotent upserts:
  • de-duplicate by (reference_number, publication_date) / source_hash
  • update changed projects (history rows are appended by DB triggers)

In production the cadence is per-connector (read from api_connectors);
these fixed schedules mirror the three required intervals.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.connectors import CONNECTORS, ConnectorContext
from app.database import SessionLocal
from app.models import Project
from app.repositories import projects as repo

log = logging.getLogger("discovery.scheduler")

scheduler = BackgroundScheduler(timezone="UTC")


def run(source_type: str) -> None:
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    for connector in CONNECTORS:
        if not connector.supports(source_type):
            continue
        start = time.monotonic()
        db = SessionLocal()
        try:
            ctx = ConnectorContext(
                base_url=None,
                auth_type="None",
                auth_secret_ref=None,
                since=since,
                rate_limit_per_min=60,
                pagination="None",
            )
            fetched = connector.fetch(ctx)
            upserts = 0
            for incoming in fetched:
                if incoming.source_hash and repo.exists_by_source_hash(
                    db, incoming.source_hash
                ):
                    continue  # unchanged → skip (de-dup)
                existing = repo.find_by_reference_and_date(
                    db, incoming.reference_number, incoming.publication_date
                )
                if existing is not None:
                    _merge(existing, incoming)
                else:
                    db.add(incoming)
                upserts += 1
            db.commit()
            elapsed_ms = int((time.monotonic() - start) * 1000)
            log.info(
                "Connector %s [%s] upserted %d projects in %dms",
                connector.key(), source_type, upserts, elapsed_ms,
            )
        except Exception as ex:  # noqa: BLE001 — one bad connector must not stop the rest
            db.rollback()
            log.error("Connector %s failed: %s", connector.key(), ex)
        finally:
            db.close()


def _merge(existing: Project, incoming: Project) -> None:
    """Update mutable fields on an existing project; the trg_projects_search
    trigger refreshes the search vector, history is tracked per changed field."""
    if existing.status != incoming.status:
        existing.status = incoming.status
    if existing.deadline != incoming.deadline:
        existing.deadline = incoming.deadline
    if incoming.ai_summary is not None:
        existing.ai_summary = incoming.ai_summary


def enrich_job() -> None:
    """AI enrichment pass over newly ingested tenders (no-op without API key)."""
    from app.ai import enricher

    result = enricher.enrich_pending()
    if result.get("enabled"):
        log.info("AI enrichment: %s", result)


def start() -> None:
    # every 15 minutes — high-frequency feeds
    scheduler.add_job(run, CronTrigger(minute="*/15"), args=["RSS Feed"],
                      id="rss-15m", replace_existing=True)
    # every 10 minutes — AI enrichment of un-summarized tenders
    scheduler.add_job(enrich_job, CronTrigger(minute="*/10"),
                      id="ai-enrich", replace_existing=True)
    # hourly — procurement & tender APIs
    scheduler.add_job(run, CronTrigger(minute=0), args=["Government Procurement API"],
                      id="gov-hourly", replace_existing=True)
    scheduler.add_job(run, CronTrigger(minute=0), args=["Public Tender API"],
                      id="tender-hourly", replace_existing=True)
    # daily at 02:00 — open-data bulk sync
    scheduler.add_job(run, CronTrigger(hour=2, minute=0), args=["Open Data Portal"],
                      id="opendata-daily", replace_existing=True)
    scheduler.start()


def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
