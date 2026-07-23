"""
Pydantic response/request models. Field names serialize to camelCase to keep
the exact JSON contract of the previous Spring Boot API — including the
Spring Data `Page` envelope (`content`, `totalElements`, `number`, `size` …).
"""
import uuid
from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True, alias_generator=to_camel, populate_by_name=True
    )


class OrganizationOut(ApiModel):
    id: uuid.UUID
    name: str
    country: str | None = None
    industry: str | None = None
    website: str | None = None


class CategoryOut(ApiModel):
    id: uuid.UUID
    name: str


class TechnologyOut(ApiModel):
    id: uuid.UUID
    name: str
    category: str | None = None


class SourceOut(ApiModel):
    id: uuid.UUID
    name: str
    source_type: str
    base_url: str | None = None
    country: str | None = None


class ProjectOut(ApiModel):
    id: uuid.UUID
    reference_number: str
    title: str
    description: str | None = None
    ai_summary: str | None = None
    ai_fit_score: int | None = None
    ai_service_line: str | None = None
    organization: OrganizationOut | None = None
    category: CategoryOut | None = None
    source: SourceOut | None = None
    country: str | None = None
    state: str | None = None
    budget_usd: int | None = None
    currency: str | None = None
    project_type: str | None = None
    status: str
    eligibility: str | None = None
    official_link: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    tags: list[str] | None = None
    deadline: date | None = None
    publication_date: date
    technologies: list[TechnologyOut] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None


T = TypeVar("T")


class Page(ApiModel, Generic[T]):
    """Spring Data `Page` compatible envelope."""

    content: list[T]
    total_elements: int
    total_pages: int
    number: int
    size: int
    number_of_elements: int
    first: bool
    last: bool
    empty: bool

    @classmethod
    def of(cls, content: list[T], total: int, page: int, size: int) -> "Page[T]":
        total_pages = max(1, -(-total // size)) if total else 0
        return cls(
            content=content,
            total_elements=total,
            total_pages=total_pages,
            number=page,
            size=size,
            number_of_elements=len(content),
            first=page == 0,
            last=page >= total_pages - 1,
            empty=len(content) == 0,
        )


class LoginRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in_minutes: int
