"""
REST router for opportunity discovery. Thin by design — validation and
orchestration live in the service. Secured with per-route RBAC, matching
the previous @PreAuthorize rules.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import Page, ProjectOut
from app.security import ALL_ROLES, get_current_user, require_roles
from app.services import projects as service
from app.services.projects import ProjectQuery

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])


@router.get(
    "",
    response_model=Page[ProjectOut],
    response_model_by_alias=True,
    summary="Search projects with filters, sorting and pagination",
    dependencies=[Depends(require_roles(*ALL_ROLES))],
)
def search(
    q: str | None = None,
    country: str | None = None,
    state: str | None = None,
    category: str | None = None,
    technology: str | None = None,
    projectType: str | None = None,
    status: str | None = None,
    organization: str | None = None,
    minBudget: int | None = None,
    maxBudget: int | None = None,
    page: int = Query(0, ge=0),
    size: int = Query(9),
    sort: str = "deadline",
    db: Session = Depends(get_db),
):
    query = ProjectQuery(
        q=q,
        country=country,
        state=state,
        category=category,
        technology=technology,
        project_type=projectType,
        status=status,
        organization=organization,
        min_budget=minBudget,
        max_budget=maxBudget,
        page=page,
        size=size,
        sort=sort,
    )
    items, total = service.search(db, query)
    content = [ProjectOut.model_validate(p) for p in items]
    return Page.of(content, total, query.page, query.size)


@router.get(
    "/{project_id}",
    response_model=ProjectOut,
    response_model_by_alias=True,
    summary="Get a single project by id",
    dependencies=[Depends(get_current_user)],
)
def get_by_id(project_id: uuid.UUID, db: Session = Depends(get_db)):
    return ProjectOut.model_validate(service.get_by_id(db, project_id))
