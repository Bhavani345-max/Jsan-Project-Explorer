# Entity–Relationship Diagram

> Renders on GitHub / any Mermaid viewer. All PKs are `UUID`; every business
> table carries `created_at, updated_at, created_by, updated_by, deleted_at`
> (omitted below for readability).

```mermaid
erDiagram
    ROLES ||--o{ USERS : "assigned to"
    USERS ||--o{ SAVED_SEARCHES : owns
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ AUDIT_LOGS : generates
    USERS ||--o{ API_CONNECTORS : "created by"

    ORGANIZATIONS ||--o{ PROJECTS : publishes
    PROJECT_CATEGORIES ||--o{ PROJECTS : classifies
    PROJECT_SOURCES ||--o{ PROJECTS : "sourced from"

    PROJECTS ||--o{ PROJECT_TECHNOLOGY_MAPPING : has
    TECHNOLOGIES ||--o{ PROJECT_TECHNOLOGY_MAPPING : "used in"
    PROJECTS ||--o{ PROJECT_HISTORY : "tracked by"
    PROJECTS ||--o{ NOTIFICATIONS : "referenced by"

    API_CONNECTORS ||--o{ CONNECTOR_LOGS : logs
    PROJECT_SOURCES ||--o{ API_CONNECTORS : "feeds via"

    ROLES {
        uuid id PK
        string name UK
        string description
    }
    USERS {
        uuid id PK
        string email UK
        string full_name
        string password_hash
        uuid role_id FK
        bool is_active
        timestamptz last_login_at
    }
    ORGANIZATIONS {
        uuid id PK
        string name
        string country
        string industry
        string website
    }
    PROJECT_CATEGORIES {
        uuid id PK
        string name UK
    }
    TECHNOLOGIES {
        uuid id PK
        string name UK
        string category
    }
    PROJECT_SOURCES {
        uuid id PK
        string name
        string source_type
        string base_url
        string country
    }
    PROJECTS {
        uuid id PK
        string reference_number
        string title
        text description
        text ai_summary
        uuid organization_id FK
        uuid category_id FK
        uuid source_id FK
        string country
        string state
        bigint budget_usd
        string currency
        string project_type
        string status
        text eligibility
        string official_link
        text_array tags
        date deadline
        date publication_date
        string source_hash
        tsvector search_vector
    }
    PROJECT_TECHNOLOGY_MAPPING {
        uuid project_id FK
        uuid technology_id FK
    }
    PROJECT_HISTORY {
        uuid id PK
        uuid project_id FK
        string changed_field
        text old_value
        text new_value
    }
    API_CONNECTORS {
        uuid id PK
        string name
        string source_type
        string base_url
        string auth_type
        string schedule
        int rate_limit_per_min
        string pagination
        bool enabled
        string status
    }
    CONNECTOR_LOGS {
        uuid id PK
        uuid connector_id FK
        string level
        text message
        int items_fetched
        int duration_ms
    }
    SAVED_SEARCHES {
        uuid id PK
        uuid user_id FK
        string name
        jsonb query_json
        bool notify
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        string channel
        string subject
        uuid project_id FK
        bool is_read
    }
    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string entity
        jsonb metadata
        inet ip_address
    }
```

## Scale & performance notes

| Concern | Design decision |
|---|---|
| Millions of projects | `projects` is **range-partitioned by `publication_date`** (monthly); automate with `pg_partman`. |
| Full-text search | `search_vector TSVECTOR` (weighted title/description/tags) + **GIN** index, maintained by trigger. |
| Autocomplete | `pg_trgm` GIN index on `title`. |
| Soft delete | `deleted_at IS NULL` **partial indexes** keep hot paths lean. |
| Append-only logs | **BRIN** indexes on `created_at` — tiny footprint at billions of rows. |
| Read scaling | Read replicas for analytics; OpenSearch mirror for cross-field relevance search. |
