"""
UK Contracts Finder connector — the first LIVE data source.

Calls the official Cabinet Office OCDS release feed (no API key required,
data under the Open Government Licence v3):

    https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search

This is a public API explicitly published for automated consumption — no
scraping of restricted pages. Each ingested project carries the ocid as its
reference number and the official notice URL, so every record is traceable
back to the government source.
"""
import hashlib
import logging
import time
from datetime import datetime, date

import httpx
from sqlalchemy import select

from app.connectors.base import ConnectorContext, SourceConnector
from app.connectors.interceptor import ApiInterceptor
from app.database import SessionLocal
from app.models import Organization, Project, ProjectCategory, ProjectSource

log = logging.getLogger("discovery.connector.contracts_finder")

BASE_URL = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search"
SOURCE_NAME = "UK Contracts Finder"
PAGE_SIZE = 100
MAX_PAGES = 5          # safety cap per collection cycle
RETRIES = 3
TIMEOUT_S = 30

# OCDS tender.status → portal status
_STATUS_MAP = {
    "active": "Open",
    "planned": "Open",
    "planning": "Open",
    "complete": "Closed",
    "cancelled": "Closed",
    "unsuccessful": "Closed",
    "withdrawn": "Closed",
}

# Keyword → seeded project_categories.name (best-effort auto-categorization)
_CATEGORY_KEYWORDS = [
    (("gis", "geospatial", "geographic information", "mapping"), "GIS"),
    (("machine learning", "artificial intelligence", " ai ", "data science"), "AI/ML"),
    (("cyber", "security operations", "penetration test"), "Cyber Security"),
    (("cloud", "azure", "aws", "migration to"), "Cloud Migration"),
    (("mobile app", "ios", "android"), "Mobile Development"),
    (("website", "web application", "web development", "portal"), "Web Development"),
    (("data warehouse", "data platform", "etl", "analytics platform"), "Data Engineering"),
    (("devops", "ci/cd", "kubernetes"), "DevOps"),
    (("erp", "crm", "sap", "oracle"), "Enterprise Software"),
]


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _parse_date(value: str | None) -> date | None:
    dt = _parse_dt(value)
    return dt.date() if dt else None


def _categorize(text: str) -> str | None:
    lowered = f" {text.lower()} "
    for keywords, category in _CATEGORY_KEYWORDS:
        if any(k in lowered for k in keywords):
            return category
    return None


class ContractsFinderConnector(SourceConnector):
    """Fetches UK public-sector tender notices published since the watermark."""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        # Records every raw request/response for provenance (see interceptor.py)
        self.interceptor = ApiInterceptor()

    def key(self) -> str:
        return "uk-contracts-finder"

    def supports(self, source_type: str) -> bool:
        return source_type in ("Public Tender API", "Government Procurement API")

    # ---- fetch -----------------------------------------------------------
    def fetch(self, context: ConnectorContext) -> list[Project]:
        releases = self._fetch_releases(context)
        if not releases:
            return []

        # Resolve FK ids (source / organizations / categories) in one short
        # session so returned Projects are detached and carry plain UUIDs.
        with SessionLocal() as db:
            source_id = self._get_or_create_source(db)
            category_ids = {
                c.name: c.id
                for c in db.scalars(select(ProjectCategory)).all()
            }
            projects, skipped = [], 0
            for release in releases:
                try:
                    project = self._map_release(db, release, source_id, category_ids)
                    if project is not None:
                        projects.append(project)
                except Exception as ex:  # noqa: BLE001 — one bad record must not kill the batch
                    skipped += 1
                    log.warning("Skipping malformed release %s: %s",
                                release.get("ocid", "?"), ex)
            db.commit()
        if skipped:
            log.warning("Skipped %d malformed releases this cycle", skipped)
        return projects

    def _fetch_releases(self, context: ConnectorContext) -> list[dict]:
        """Paginated fetch with retry/backoff, honoring the rate budget."""
        published_from = context.since.strftime("%Y-%m-%dT%H:%M:%S")
        url = (f"{self.base_url}?publishedFrom={published_from}"
               f"&stages=tender&limit={PAGE_SIZE}")
        releases: list[dict] = []
        min_interval = 60.0 / max(1, context.rate_limit_per_min)

        with httpx.Client(timeout=TIMEOUT_S,
                          headers={"Accept": "application/json"},
                          event_hooks=self.interceptor.event_hooks()) as client:
            for page in range(MAX_PAGES):
                payload = self._get_with_retry(client, url)
                if payload is None:
                    break
                batch = payload.get("releases") or []
                releases.extend(batch)
                next_url = (payload.get("links") or {}).get("next")
                if not next_url or len(batch) < PAGE_SIZE:
                    break
                url = next_url
                time.sleep(min_interval)  # stay inside the rate budget
        return releases

    @staticmethod
    def _get_with_retry(client: httpx.Client, url: str) -> dict | None:
        for attempt in range(1, RETRIES + 1):
            try:
                resp = client.get(url)
                if resp.status_code == 429:          # rate limited — back off
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, ValueError) as ex:
                log.warning("Fetch attempt %d/%d failed: %s", attempt, RETRIES, ex)
                if attempt < RETRIES:
                    time.sleep(2 ** attempt)         # exponential backoff
        return None

    # ---- mapping ---------------------------------------------------------
    def _map_release(self, db, release: dict, source_id,
                     category_ids: dict) -> Project | None:
        tender = release.get("tender") or {}
        # Normalize whitespace — some notices embed newlines in titles
        title = " ".join((tender.get("title") or "").split())
        ocid = release.get("ocid")
        pub_date = _parse_date(release.get("date"))
        if not title or not ocid or not pub_date:
            return None                              # unusable record

        value = tender.get("value") or {}
        period = tender.get("tenderPeriod") or {}
        classification = (tender.get("classification") or {}).get("description")
        notice_url = next(
            (d.get("url") for d in tender.get("documents") or []
             if d.get("documentType") == "tenderNotice" and d.get("url")),
            None,
        )

        buyer_name = ((release.get("buyer") or {}).get("name") or "").strip()
        org_id = (self._get_or_create_org(db, buyer_name)
                  if buyer_name else None)

        description = tender.get("description") or ""
        category_name = _categorize(f"{title} {classification or ''} {description[:500]}")

        amount = value.get("amount")
        deadline = _parse_date(period.get("endDate"))
        status = _STATUS_MAP.get((tender.get("status") or "").lower(), "Open")

        fingerprint = f"{ocid}|{status}|{deadline}|{amount}|{title}"
        tags = [t for t in (classification, "UK", "Contracts Finder") if t]

        return Project(
            reference_number=ocid[:120],
            title=title[:400],
            description=description or None,
            organization_id=org_id,
            category_id=category_ids.get(category_name),
            source_id=source_id,
            country="United Kingdom",
            budget_usd=int(amount) if amount is not None else None,
            currency=value.get("currency"),
            project_type="Public Tender",
            status=status,
            official_link=(notice_url or "")[:600] or None,
            tags=tags,
            deadline=deadline,
            publication_date=pub_date,
            source_hash=hashlib.sha256(fingerprint.encode()).hexdigest(),
        )

    # ---- FK resolution ---------------------------------------------------
    @staticmethod
    def _get_or_create_source(db) -> "ProjectSource.id":
        source = db.scalars(
            select(ProjectSource).where(ProjectSource.name == SOURCE_NAME)
        ).first()
        if source is None:
            source = ProjectSource(
                name=SOURCE_NAME, source_type="Public Tender API",
                base_url=BASE_URL, country="United Kingdom",
            )
            db.add(source)
            db.flush()
        return source.id

    @staticmethod
    def _get_or_create_org(db, name: str):
        name = name[:255]
        org = db.scalars(
            select(Organization).where(
                Organization.name == name,
                Organization.country == "United Kingdom",
            )
        ).first()
        if org is None:
            org = Organization(name=name, country="United Kingdom")
            db.add(org)
            db.flush()
        return org.id
