-- =====================================================================
--  Project Discovery Portal — PostgreSQL schema (v2)
--  Requirements met:
--   • 3NF normalized            • UUID primary keys everywhere
--   • FK relationships          • Indexes for fast search
--   • Audit cols (created_at / updated_at / created_by / updated_by)
--   • Soft delete (deleted_at)  • Full-text search (tsvector + GIN)
--   • Optimized for millions of rows (BRIN, partial & trigram indexes,
--     declarative range partitioning for the hot `projects` table)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy autocomplete
CREATE EXTENSION IF NOT EXISTS btree_gin;    -- composite gin indexes

-- ---------------------------------------------------------------------
--  Convention: every business table carries the same audit + soft-delete
--  columns (created_at, updated_at, created_by, updated_by, deleted_at).
--  `updated_at` is maintained by the trigger below.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- Identity & access -----------------------------------------
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID,
    updated_by  UUID,
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,           -- BCrypt
    role_id       UUID NOT NULL REFERENCES roles(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ
);

-- ---------- Reference / lookup ----------------------------------------
CREATE TABLE organizations (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL,
    country    VARCHAR(100),
    industry   VARCHAR(120),
    website    VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ,
    UNIQUE (name, country)
);

CREATE TABLE project_categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(80) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE technologies (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(80) UNIQUE NOT NULL,
    category   VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE project_sources (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(150) NOT NULL,
    source_type VARCHAR(60) NOT NULL,
    base_url    VARCHAR(500),
    country     VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID,
    updated_by  UUID,
    deleted_at  TIMESTAMPTZ
);

-- ---------- Core opportunity (PARTITIONED for scale) ------------------
-- Range-partitioned by publication_date. At millions of rows, queries and
-- retention operations touch only the relevant monthly partitions.
CREATE TABLE projects (
    id                UUID NOT NULL DEFAULT uuid_generate_v4(),
    reference_number  VARCHAR(120) NOT NULL,
    title             VARCHAR(400) NOT NULL,
    description       TEXT,
    ai_summary        TEXT,
    ai_fit_score      SMALLINT,             -- 0-100 AI relevance to company profile
    ai_service_line   VARCHAR(60),          -- AI-assigned service line
    organization_id   UUID REFERENCES organizations(id),
    category_id       UUID REFERENCES project_categories(id),
    source_id         UUID REFERENCES project_sources(id),
    country           VARCHAR(100),
    state             VARCHAR(120),
    budget_usd        BIGINT,
    currency          VARCHAR(8),
    project_type      VARCHAR(60),
    status            VARCHAR(30) NOT NULL DEFAULT 'Open',
    eligibility       TEXT,
    official_link     VARCHAR(600),
    contact_name      VARCHAR(150),
    contact_email     VARCHAR(255),
    contact_phone     VARCHAR(60),
    tags              TEXT[],
    deadline          DATE,
    publication_date  DATE NOT NULL,
    source_hash       VARCHAR(64),
    -- Full-text search vector maintained by trigger (title^A, desc^B, tags^C)
    search_vector     TSVECTOR,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID,
    deleted_at        TIMESTAMPTZ,
    PRIMARY KEY (id, publication_date),
    UNIQUE (source_id, reference_number, publication_date)   -- de-dup guard
) PARTITION BY RANGE (publication_date);

-- Example partitions (create one per month via automation, e.g. pg_partman)
CREATE TABLE projects_2026_06 PARTITION OF projects
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE projects_2026_07 PARTITION OF projects
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE projects_default  PARTITION OF projects DEFAULT;

CREATE OR REPLACE FUNCTION projects_search_vector() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B') ||
        setweight(to_tsvector('english', array_to_string(coalesce(NEW.tags,'{}'),' ')), 'C');
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_search BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION projects_search_vector();

CREATE TABLE project_technology_mapping (
    project_id       UUID NOT NULL,
    publication_date DATE NOT NULL,
    technology_id    UUID NOT NULL REFERENCES technologies(id),
    PRIMARY KEY (project_id, publication_date, technology_id),
    FOREIGN KEY (project_id, publication_date)
        REFERENCES projects(id, publication_date) ON DELETE CASCADE
);

-- ---------- Change tracking -------------------------------------------
CREATE TABLE project_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id    UUID NOT NULL,
    changed_field VARCHAR(80) NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by    UUID
);

-- ---------- Connectors & ingestion ------------------------------------
CREATE TABLE api_connectors (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name               VARCHAR(150) NOT NULL,
    source_type        VARCHAR(60) NOT NULL,
    base_url           VARCHAR(500) NOT NULL,
    auth_type          VARCHAR(30) NOT NULL DEFAULT 'None',
    auth_secret_ref    VARCHAR(200),               -- pointer to Vault/KMS, never a raw secret
    schedule           VARCHAR(30) NOT NULL,
    rate_limit_per_min INT NOT NULL DEFAULT 60,
    pagination         VARCHAR(20) NOT NULL DEFAULT 'None',
    retry_policy       VARCHAR(120),
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at        TIMESTAMPTZ,
    next_run_at        TIMESTAMPTZ,
    status             VARCHAR(20) NOT NULL DEFAULT 'Idle',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         UUID REFERENCES users(id),
    updated_by         UUID REFERENCES users(id),
    deleted_at         TIMESTAMPTZ
);

-- High-volume append-only log — BRIN index keeps it cheap at scale.
CREATE TABLE connector_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connector_id  UUID NOT NULL REFERENCES api_connectors(id) ON DELETE CASCADE,
    level         VARCHAR(10) NOT NULL,
    message       TEXT,
    items_fetched INT DEFAULT 0,
    duration_ms   INT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- User features ---------------------------------------------
CREATE TABLE saved_searches (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(120) NOT NULL,
    query_json JSONB NOT NULL,
    notify     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel    VARCHAR(20) NOT NULL,               -- Email, Slack, Teams
    subject    VARCHAR(255),
    body       TEXT,
    project_id UUID,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- ---------- Compliance -------------------------------------------------
CREATE TABLE audit_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id),
    action     VARCHAR(80) NOT NULL,
    entity     VARCHAR(80),
    entity_id  VARCHAR(80),
    metadata   JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  updated_at triggers on mutable business tables
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_users_upd        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orgs_upd         BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_connectors_upd   BEFORE UPDATE ON api_connectors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_saved_upd        BEFORE UPDATE ON saved_searches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
--  Indexes for fast search (millions of rows)
--  Partial indexes exclude soft-deleted rows to keep them lean.
-- ---------------------------------------------------------------------
CREATE INDEX idx_projects_search   ON projects USING gin (search_vector);         -- full-text
CREATE INDEX idx_projects_title_tg ON projects USING gin (title gin_trgm_ops);    -- autocomplete
CREATE INDEX idx_projects_tags     ON projects USING gin (tags);
CREATE INDEX idx_projects_status   ON projects (status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_country  ON projects (country)  WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_category ON projects (category_id);
CREATE INDEX idx_projects_deadline ON projects (deadline) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_budget   ON projects (budget_usd);
CREATE INDEX idx_projects_pub_brin ON projects USING brin (publication_date);     -- cheap on huge tables
CREATE INDEX idx_projects_ai_fit  ON projects (ai_fit_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_ref      ON projects (reference_number);

CREATE INDEX idx_users_email       ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_conn_logs_brin    ON connector_logs USING brin (created_at);
CREATE INDEX idx_conn_logs_conn    ON connector_logs (connector_id, created_at DESC);
CREATE INDEX idx_audit_user_time   ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_saved_user        ON saved_searches (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notif_user_unread ON notifications (user_id) WHERE is_read = FALSE AND deleted_at IS NULL;

-- ---------- Seed lookup data ------------------------------------------
INSERT INTO roles (name, description) VALUES
    ('Administrator','Full access incl. connector & user management'),
    ('Business Development','Discover, save, and track opportunities'),
    ('Sales Team','Pursue and update opportunity status'),
    ('Manager','Analytics & reporting, read/approve'),
    ('Read Only','View-only access');

INSERT INTO project_categories (name) VALUES
    ('GIS'),('AI/ML'),('Cloud Migration'),('Web Development'),('Mobile Development'),
    ('Data Engineering'),('Enterprise Software'),('Cyber Security'),('DevOps');

INSERT INTO technologies (name, category) VALUES
    ('Java','Language'),('Python','Language'),('React','Framework'),('Angular','Framework'),
    ('Spring Boot','Framework'),('Node.js','Framework'),('AWS','Cloud'),('Azure','Cloud'),
    ('GCP','Cloud'),('GIS','Domain'),('AI','Domain'),('Machine Learning','Domain'),
    ('Cyber Security','Domain'),('DevOps','Practice'),('SAP','Enterprise'),
    ('Oracle','Database'),('SQL','Database');
