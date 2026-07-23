# API Design

Base path (FastAPI backend): `/api/v1` · Auth: `Authorization: Bearer <JWT>` ·
Docs: `/swagger-ui.html` · Spec: `/v3/api-docs`

The reference Next.js backend exposes the same resources under `/api/*`
(no version prefix) so the UI runs standalone.

## Authentication
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ token, expiresIn, role }` |
| POST | `/auth/refresh` | `{ token }` | `{ token }` |
| GET  | `/auth/me` | — | current user + role |

## Projects
| Method | Path | Notes |
|---|---|---|
| GET | `/projects` | Filters: `q, country, state, category, technology, projectType, status, organization, minBudget, maxBudget`; paging: `page, size, sort`. Returns a `Page<Project>`. |
| GET | `/projects/{id}` | Single project (+ related in reference API). |
| GET | `/projects/search?q=` | Weighted full-text relevance (tsvector). |

### Example
```
GET /api/v1/projects?technology=GIS&status=Open&minBudget=1000000&sort=budget&page=0&size=9
```
```json
{
  "content": [
    {
      "id": "c0000000-…",
      "referenceNumber": "SAM-2026-4820",
      "title": "Statewide GIS Land Records Modernization Platform",
      "organization": "California Dept. of Technology",
      "country": "United States",
      "budgetUsd": 4200000,
      "status": "Open",
      "deadline": "2026-08-03",
      "technologies": ["GIS", "Python", "React", "AWS", "SQL"]
    }
  ],
  "totalElements": 3,
  "totalPages": 1,
  "number": 0,
  "size": 9
}
```

## Dashboard & Analytics
| Method | Path | Returns |
|---|---|---|
| GET | `/dashboard` | KPI stats + recent opportunities |
| GET | `/analytics` | per-month, by-country, trending tech, top orgs, success rate |
| GET | `/facets` | distinct values for filter dropdowns |
| GET | `/suggest?q=` | autocomplete suggestions |

## Connectors (Admin only)
| Method | Path | Notes |
|---|---|---|
| GET | `/connectors` | list + recent logs |
| POST | `/connectors` | create (auth, schedule, rate limit, pagination, retry) |
| PUT | `/connectors/{id}` | update / enable-disable |
| POST | `/connectors/{id}/run` | trigger an immediate collection |
| GET | `/connectors/{id}/logs` | connector logs |

## Notifications & Saved Searches
| Method | Path |
|---|---|
| GET/POST | `/saved-searches` |
| GET | `/notifications` |
| POST | `/notifications/test` (Email / Slack / Teams) |

## Conventions
- **Errors**: RFC-7807 `application/problem+json` (see `GlobalExceptionHandler`).
- **Pagination**: Spring-`Page`-compatible shape (`content`, `totalElements`, `number`, `size`).
- **Rate limiting**: per-connector via Resilience4j; per-user via Redis token bucket.
- **Idempotent ingestion**: de-dup by `(reference_number, publication_date)` + `source_hash`.
