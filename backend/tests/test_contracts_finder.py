"""
Offline unit tests for the UK Contracts Finder connector.

The fixture (`fixtures/ocds_capture.json`) is a REAL payload captured from the
live OCDS API by the ApiInterceptor — so the mapping is tested against actual
production data shapes, with no network access needed.
"""
import json
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.connectors.contracts_finder import (
    ContractsFinderConnector,
    _categorize,
    _parse_date,
    _STATUS_MAP,
)

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "ocds_capture.json").read_text(encoding="utf-8")
)


@pytest.fixture
def connector():
    return ContractsFinderConnector()


@pytest.fixture
def db():
    """Mock session: org/category resolution is exercised via _map_release's
    injected ids, so no real DB is required."""
    return MagicMock()


def _map(connector, db, release):
    connector._get_or_create_org = MagicMock(return_value="org-uuid")
    return connector._map_release(db, release, source_id="src-uuid", category_ids={})


class TestMapping:
    def test_maps_all_real_releases(self, connector, db):
        projects = [_map(connector, db, r) for r in FIXTURE["releases"]]
        projects = [p for p in projects if p is not None]
        assert len(projects) == len(FIXTURE["releases"])  # all real records map

    def test_field_mapping_from_real_payload(self, connector, db):
        p = _map(connector, db, FIXTURE["releases"][0])
        assert p.reference_number.startswith("ocds-b5fd17-")
        assert p.title
        assert p.country == "United Kingdom"
        assert p.project_type == "Public Tender"
        assert p.status in ("Open", "Closed")
        assert p.source_hash and len(p.source_hash) == 64
        assert isinstance(p.publication_date, date)
        if p.budget_usd is not None:
            assert p.budget_usd > 0
            assert p.currency == "GBP"
        if p.official_link:
            assert p.official_link.startswith("https://www.contractsfinder.service.gov.uk/")

    def test_source_hash_is_stable_and_change_sensitive(self, connector, db):
        release = FIXTURE["releases"][0]
        a = _map(connector, db, release)
        b = _map(connector, db, release)
        assert a.source_hash == b.source_hash  # deterministic → dedup works

        changed = json.loads(json.dumps(release))
        changed["tender"]["status"] = "cancelled"
        c = _map(connector, db, changed)
        assert c.source_hash != a.source_hash  # change → new hash → re-upsert

    def test_malformed_release_returns_none(self, connector, db):
        assert _map(connector, db, {}) is None
        assert _map(connector, db, {"ocid": "x", "tender": {}}) is None       # no title
        assert _map(connector, db, {"tender": {"title": "T"}}) is None        # no ocid

    def test_fetch_isolates_bad_records(self, connector, monkeypatch):
        """One malformed release must not kill the batch."""
        good = FIXTURE["releases"][0]
        monkeypatch.setattr(connector, "_fetch_releases",
                            lambda ctx: [good, {"ocid": None}, good])
        session = MagicMock()
        session.scalars.return_value.first.return_value = None
        session.scalars.return_value.all.return_value = []
        monkeypatch.setattr("app.connectors.contracts_finder.SessionLocal",
                            lambda: MagicMock(__enter__=lambda s: session,
                                              __exit__=lambda s, *a: False))
        projects = connector.fetch(context=MagicMock())
        assert len(projects) == 2  # the two good ones survive


class TestHelpers:
    def test_status_map_covers_ocds_statuses(self):
        assert _STATUS_MAP["active"] == "Open"
        assert _STATUS_MAP["cancelled"] == "Closed"
        assert _STATUS_MAP["complete"] == "Closed"

    def test_parse_date_handles_tz_and_garbage(self):
        assert _parse_date("2026-07-23T10:21:11+01:00") == date(2026, 7, 23)
        assert _parse_date("not-a-date") is None
        assert _parse_date(None) is None

    def test_categorize(self):
        assert _categorize("Geospatial mapping platform") == "GIS"
        assert _categorize("machine learning fraud detection") == "AI/ML"
        assert _categorize("Distribution board replacements") is None
