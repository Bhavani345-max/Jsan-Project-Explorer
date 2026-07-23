"""
SQLAlchemy 2.0 ORM models mirroring /db/schema.sql.

Conventions carried over from the schema:
  • UUID primary keys everywhere
  • Audit columns (created_at / updated_at / created_by / updated_by)
  • Soft delete via deleted_at — repositories always filter `deleted_at IS NULL`
  • `projects` is range-partitioned by publication_date, hence its composite
    primary key (id, publication_date)
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    SmallInteger,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Table,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """created_at / updated_at / deleted_at — lookup tables
    (project_categories, technologies) carry only these."""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None]

    def soft_delete(self) -> None:
        self.deleted_at = datetime.utcnow()


class AuditMixin(TimestampMixin):
    """Full audit columns for business tables (BaseEntity equivalent):
    timestamps plus created_by / updated_by."""

    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class Role(AuditMixin, Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class User(AuditMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(150))
    password_hash: Mapped[str] = mapped_column(String(255))  # BCrypt
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None]

    role: Mapped[Role] = relationship(lazy="joined")


class Organization(AuditMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(100))
    industry: Mapped[str | None] = mapped_column(String(120))
    website: Mapped[str | None] = mapped_column(String(255))


class ProjectCategory(TimestampMixin, Base):
    __tablename__ = "project_categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class Technology(TimestampMixin, Base):
    __tablename__ = "technologies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    category: Mapped[str | None] = mapped_column(String(60))


class ProjectSource(AuditMixin, Base):
    __tablename__ = "project_sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150))
    source_type: Mapped[str] = mapped_column(String(60))
    base_url: Mapped[str | None] = mapped_column(String(500))
    country: Mapped[str | None] = mapped_column(String(100))


# Association table with the composite FK to the partitioned projects table.
project_technology_mapping = Table(
    "project_technology_mapping",
    Base.metadata,
    Column("project_id", Uuid, primary_key=True),
    Column("publication_date", Date, primary_key=True),
    Column(
        "technology_id", Uuid, ForeignKey("technologies.id"), primary_key=True
    ),
    ForeignKeyConstraint(
        ["project_id", "publication_date"],
        ["projects.id", "projects.publication_date"],
        ondelete="CASCADE",
    ),
)


class Project(AuditMixin, Base):
    """Core opportunity aggregate (partitioned by publication_date)."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    publication_date: Mapped[date] = mapped_column(Date, primary_key=True)

    reference_number: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(400))
    description: Mapped[str | None] = mapped_column(Text)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_fit_score: Mapped[int | None] = mapped_column(SmallInteger)
    ai_service_line: Mapped[str | None] = mapped_column(String(60))

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_categories.id")
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_sources.id")
    )

    country: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(120))
    budget_usd: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str | None] = mapped_column(String(8))
    project_type: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(30), default="Open")
    eligibility: Mapped[str | None] = mapped_column(Text)
    official_link: Mapped[str | None] = mapped_column(String(600))
    contact_name: Mapped[str | None] = mapped_column(String(150))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(60))
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    deadline: Mapped[date | None] = mapped_column(Date)
    source_hash: Mapped[str | None] = mapped_column(String(64))
    # Maintained by the trg_projects_search DB trigger — never written here.
    search_vector = mapped_column(TSVECTOR)

    organization: Mapped[Organization | None] = relationship(lazy="selectin")
    category: Mapped[ProjectCategory | None] = relationship(lazy="selectin")
    source: Mapped[ProjectSource | None] = relationship(lazy="selectin")
    technologies: Mapped[list[Technology]] = relationship(
        secondary=project_technology_mapping, lazy="selectin"
    )


class ApiConnector(AuditMixin, Base):
    __tablename__ = "api_connectors"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150))
    source_type: Mapped[str] = mapped_column(String(60))
    base_url: Mapped[str] = mapped_column(String(500))
    auth_type: Mapped[str] = mapped_column(String(30), default="None")
    # Pointer to the secret in Vault/KMS — never the raw credential.
    auth_secret_ref: Mapped[str | None] = mapped_column(String(200))
    schedule: Mapped[str] = mapped_column(String(30))
    rate_limit_per_min: Mapped[int] = mapped_column(Integer, default=60)
    pagination: Mapped[str] = mapped_column(String(20), default="None")
    retry_policy: Mapped[str | None] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None]
    next_run_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(String(20), default="Idle")
