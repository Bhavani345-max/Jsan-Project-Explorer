"""
Unit tests for the filter builders (port of ProjectSpecificationsTest).
Blank inputs must produce a no-op (None) filter so they don't constrain
the query.
"""
from app.repositories import filters
from app.services.projects import ProjectQuery


class TestFilters:
    def test_blank_filters_are_ignored(self):
        assert filters.keyword("") is None
        assert filters.country(None) is None
        assert filters.technology("  ") is None

    def test_populated_filters_build_conditions(self):
        assert filters.country("United States") is not None
        assert filters.keyword("gis") is not None
        assert filters.technology("Python") is not None
        assert filters.category("AI/ML") is not None
        assert filters.organization("NASA") is not None

    def test_budget_range_handles_open_ends(self):
        assert filters.budget_between(1_000_000, None) is not None
        assert filters.budget_between(None, 5_000_000) is not None
        assert filters.budget_between(1_000_000, 5_000_000) is not None
        assert filters.budget_between(None, None) is None


class TestProjectQuery:
    def test_size_is_capped_and_defaulted(self):
        assert ProjectQuery(size=0).size == 9
        assert ProjectQuery(size=101).size == 9
        assert ProjectQuery(size=50).size == 50

    def test_negative_page_is_clamped(self):
        assert ProjectQuery(page=-3).page == 0
