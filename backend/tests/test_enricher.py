"""Unit tests for the AI enrichment layer (OpenRouter responses mocked)."""
from datetime import date
from unittest.mock import MagicMock

from app.ai import openrouter
from app.ai.enricher import SYSTEM_PROMPT, apply_enrichment, build_user_prompt
from app.models import Project


def make_project(**kw) -> Project:
    p = Project(
        reference_number="ocds-b5fd17-test", title="GIS platform build",
        description="Build a geospatial platform", country="United Kingdom",
        publication_date=date(2026, 7, 1), status="Open",
    )
    p.technologies = []
    for k, v in kw.items():
        setattr(p, k, v)
    return p


class TestPrompt:
    def test_system_prompt_encodes_company_profile(self):
        assert "Geospatial Intelligence" in SYSTEM_PROMPT
        assert "Telecom & Network Engineering" in SYSTEM_PROMPT
        assert "fit_score" in SYSTEM_PROMPT

    def test_user_prompt_includes_notice_fields(self):
        p = make_project(budget_usd=100000, currency="GBP")
        text = build_user_prompt(p)
        assert "GIS platform build" in text
        assert "100000 GBP" in text


class TestApplyEnrichment:
    def _db(self):
        db = MagicMock()
        db.scalars.return_value.first.return_value = None
        return db

    def test_applies_valid_result(self):
        p = make_project()
        ok = apply_enrichment(self._db(), p, {
            "summary": "A statewide GIS build.",
            "fit_score": 92,
            "service_line": "Geospatial Intelligence",
            "category": None,
            "technologies": [],
            "tags": ["GIS", "UK"],
        })
        assert ok
        assert p.ai_summary == "A statewide GIS build."
        assert p.ai_fit_score == 92
        assert p.ai_service_line == "Geospatial Intelligence"
        assert "GIS" in p.tags

    def test_clamps_out_of_range_score(self):
        p = make_project()
        apply_enrichment(self._db(), p, {"summary": "s", "fit_score": 400})
        assert p.ai_fit_score == 100

    def test_rejects_invalid_service_line_and_empty_summary(self):
        p = make_project()
        assert not apply_enrichment(self._db(), p, {"summary": "", "fit_score": 10})
        apply_enrichment(self._db(), p, {"summary": "s", "service_line": "Hacking"})
        assert p.ai_service_line is None

    def test_non_numeric_score_becomes_none(self):
        p = make_project()
        apply_enrichment(self._db(), p, {"summary": "s", "fit_score": "high"})
        assert p.ai_fit_score is None


class TestJsonParsing:
    def test_plain_json(self):
        assert openrouter._parse_json('{"a": 1}') == {"a": 1}

    def test_fenced_json(self):
        assert openrouter._parse_json('```json\n{"a": 1}\n```') == {"a": 1}

    def test_garbage_returns_none(self):
        assert openrouter._parse_json("I cannot help with that") is None
        assert openrouter._parse_json("[1,2]") is None
