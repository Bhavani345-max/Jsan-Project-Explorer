# System Architecture

## 1. High-level

```
                         ┌───────────────────────────────────────────┐
                         │              Users (RBAC)                  │
                         │ Admin · BizDev · Sales · Manager · ReadOnly│
                         └────────────────────┬──────────────────────┘
                                              │ HTTPS
                                     ┌────────▼────────┐
                                     │   Nginx / CDN   │
                                     └────────┬────────┘
                     ┌────────────────────────┼────────────────────────┐
                     │                         │                        │
             ┌───────▼────────┐       ┌────────▼────────┐      ┌────────▼────────┐
             │  Next.js UI    │  REST │  FastAPI backend │      │  Swagger / Docs │
             │ React + TS +   │◄─────►│  JWT · RBAC ·    │      │  /swagger-ui    │
             │ Tailwind + MUI │       │  MVC · Services  │      └─────────────────┘
             └────────────────┘       └───┬─────┬─────┬──┘
                                          │     │     │
                     ┌────────────────────┘     │     └────────────────────┐
             ┌───────▼────────┐        ┌─────────▼───────┐         ┌────────▼────────┐
             │  PostgreSQL    │        │  Redis (cache)  │         │ OpenSearch /    │
             │ (partitioned,  │        │  hot queries,   │         │ Elasticsearch   │
             │  full-text)    │        │  rate limits    │         │ relevance search│
             └───────┬────────┘        └─────────────────┘         └─────────────────┘
                     │
        ┌────────────▼─────────────┐        ┌──────────────────────────────┐
        │  Collection Scheduler    │        │  Connector Framework          │
        │  (Quartz / @Scheduled)   │───────►│  SAM.gov · TED · RSS · JSON   │
        │  15m / hourly / daily    │        │  auth · pagination · retry    │
        └──────────────────────────┘        └───────────────┬──────────────┘
                                                             │ public APIs only
                                          ┌──────────────────▼──────────────────┐
                                          │  Government / Open-Data / RSS sources│
                                          └──────────────────────────────────────┘

        Cross-cutting: RabbitMQ (async notifications) · ELK (logs) ·
                       Prometheus + Grafana (metrics) · rule-based scoring
                       (keyword extraction, categorization, fit score)
```

## 2. Design principles

- **Layered MVC** — Controller → Service → Repository → Entity. Controllers are thin; business logic lives in services.
- **Repository pattern** — storage is abstracted behind `*Repository` interfaces. The reference frontend ships an in-memory repository (`src/lib/repository.ts`) that is API-compatible with the JPA repositories, so the UI runs with zero infra.
- **SOLID** — the connector framework is Open/Closed: new sources implement `SourceConnector` without changing the scheduler.
- **Stateless & scalable** — JWT auth, no server session; horizontal scaling behind Nginx.
- **Security** — RBAC via method-level `@PreAuthorize`, BCrypt hashing, secrets by reference (Vault/KMS), audit logging on every privileged action.
- **Compliance** — public sources only (official APIs, RSS, open-data portals). Connectors must respect robots/ToS; no scraping of sites that prohibit automation.

## 3. Two ways to run

| Mode | Stack | Use |
|---|---|---|
| **Zero-infrastructure** | Next.js + TypeScript route handlers + in-memory repository | Instant demo of every module & UI; `npm run dev` |
| **Local full stack** | Next.js UI + FastAPI (Python) + PostgreSQL + Redis + OpenSearch | Development; `docker compose up` |
| **Production** | Next.js on **Vercel** · **Neon PostgreSQL** | Live today; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| **Production + public API** | the above, plus FastAPI on **Railway** | Configured, not provisioned — optional, see [DEPLOYMENT.md](DEPLOYMENT.md) §2 |

The Next.js route handlers under `src/app/api/*` implement the same contract as
the FastAPI routers. In production they serve the portal by querying Postgres
directly and never call the FastAPI service — which is why deploying it is
optional. When it is deployed, it exposes the same contract independently at its
own domain (`NEXT_PUBLIC_API_BASE`) for external consumers.

## 4. Module → implementation map

| Module | Frontend | Backend |
|---|---|---|
| Dashboard | `src/app/page.tsx` | `GET /api/v1/dashboard` |
| Project Explorer | `src/app/explorer` | `GET /api/v1/projects` + Specifications |
| Project Details | `src/app/projects/[id]` | `GET /api/v1/projects/{id}` |
| API Connectors | `src/app/connectors` | `connector/*`, `api_connectors` table |
| Scheduler | (status UI) | `scheduler/CollectionScheduler` |
| Smart Search | topbar autocomplete | `GET /api/v1/suggest`, `fullTextSearch` |
| Rule-based scoring | Fit score + breakdown on details | `fit_score`, `tags`, `src/lib/scoring.ts` |
| Analytics | `src/app/analytics` | aggregate queries |
| Auth / RBAC | role switcher + guards | `config/SecurityConfig`, JWT |
