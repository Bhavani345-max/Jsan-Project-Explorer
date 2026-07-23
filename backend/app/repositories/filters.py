"""
Composable filter builders backing the Project Explorer — the Python
equivalent of the JPA `ProjectSpecifications`. Each function returns a
SQLAlchemy condition, or None when its argument is blank so the service can
chain them and drop the no-ops.
"""
from sqlalchemy import or_
from sqlalchemy.sql.elements import ColumnElement

from app.models import Project


def _is_blank(s: str | None) -> bool:
    return s is None or not s.strip()


def keyword(q: str | None) -> ColumnElement | None:
    if _is_blank(q):
        return None
    like = f"%{q.lower()}%"
    return or_(
        Project.title.ilike(like),
        Project.description.ilike(like),
        Project.reference_number.ilike(like),
    )


def country(v: str | None) -> ColumnElement | None:
    return None if _is_blank(v) else Project.country == v


def state(v: str | None) -> ColumnElement | None:
    return None if _is_blank(v) else Project.state == v


def status(v: str | None) -> ColumnElement | None:
    return None if _is_blank(v) else Project.status == v


def project_type(v: str | None) -> ColumnElement | None:
    return None if _is_blank(v) else Project.project_type == v


def category(name: str | None) -> ColumnElement | None:
    if _is_blank(name):
        return None
    return Project.category.has(name=name)


def organization(name: str | None) -> ColumnElement | None:
    if _is_blank(name):
        return None
    return Project.organization.has(name=name)


def technology(name: str | None) -> ColumnElement | None:
    if _is_blank(name):
        return None
    return Project.technologies.any(name=name)


def budget_between(
    min_budget: int | None, max_budget: int | None
) -> ColumnElement | None:
    if min_budget is not None and max_budget is not None:
        return Project.budget_usd.between(min_budget, max_budget)
    if min_budget is not None:
        return Project.budget_usd >= min_budget
    if max_budget is not None:
        return Project.budget_usd <= max_budget
    return None
