"""
Application service — orchestrates the repository behind a clean API,
keeping routers thin (same layering as the previous ProjectService).
"""
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.errors import ResourceNotFoundException
from app.models import Project
from app.repositories import filters, projects as repo


@dataclass(frozen=True)
class ProjectQuery:
    """Immutable query object bound from Project Explorer request params.
    Nulls/blanks are treated as "no filter"."""

    q: str | None = None
    country: str | None = None
    state: str | None = None
    category: str | None = None
    technology: str | None = None
    project_type: str | None = None
    status: str | None = None
    organization: str | None = None
    min_budget: int | None = None
    max_budget: int | None = None
    page: int = 0
    size: int = 9
    sort: str = "deadline"

    def __post_init__(self):
        if self.size <= 0 or self.size > 100:
            object.__setattr__(self, "size", 9)  # safe default / cap
        if self.page < 0:
            object.__setattr__(self, "page", 0)


_SORTS = {
    "budget": Project.budget_usd.desc(),
    "publicationDate": Project.publication_date.desc(),
    "deadline": Project.deadline.asc(),
}


def search(db: Session, q: ProjectQuery) -> tuple[list[Project], int]:
    """Dynamic, filtered, paginated search used by the Project Explorer.
    Returns (items, total)."""
    conditions = [
        c
        for c in (
            filters.keyword(q.q),
            filters.country(q.country),
            filters.state(q.state),
            filters.category(q.category),
            filters.technology(q.technology),
            filters.project_type(q.project_type),
            filters.status(q.status),
            filters.organization(q.organization),
            filters.budget_between(q.min_budget, q.max_budget),
        )
        if c is not None
    ]
    order_by = _SORTS.get(q.sort or "deadline", _SORTS["deadline"])
    total = repo.count(db, *conditions)
    items = repo.search(
        db, *conditions, order_by=order_by, offset=q.page * q.size, limit=q.size
    )
    return items, total


def get_by_id(db: Session, project_id: uuid.UUID) -> Project:
    project = repo.find_by_id(db, project_id)
    if project is None:
        raise ResourceNotFoundException("Project", str(project_id))
    return project
