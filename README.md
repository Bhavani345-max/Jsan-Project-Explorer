# Project Discovery Portal

An enterprise web application that helps a business-development team **discover
software development opportunities** — RFPs, RFQs, government tenders, IT
procurement notices, startup announcements and more — collected from
**publicly available sources only** (official public APIs, RSS feeds,
government procurement APIs, and open-data portals). No scraping of sites that
prohibit automated access.

> **The reference UI runs right now** — a production-quality Next.js + TypeScript
> + Tailwind app with a repository-pattern data layer, so every module is
> demonstrable with zero infrastructure. The full enterprise stack
> (Python/FastAPI + PostgreSQL + Redis + OpenSearch) ships alongside it and is
> wired for `docker compose up`.

---

## Quick start (runs immediately)

```bash
npm install
npm run dev        # → http://localhost:3000
```

Build & serve production:
```bash
npm run build && npm run start
```

Full enterprise stack (Postgres, Redis, OpenSearch, FastAPI backend, UI):
```bash
docker compose up --build
```

With the full stack running, the portal ingests **real UK government tenders**
from the official [Contracts Finder OCDS API](https://www.contractsfinder.service.gov.uk)
(no key required, Open Government Licence) on the built-in schedule, and the UI
sidebar switches from "Sample dataset" to **"Live data connected"**. Every raw
API response is captured with a SHA-256 by the `ApiInterceptor` for provenance
(`backend/app/connectors/interceptor.py`). Quality audit: [`score.md`](score.md).

Dev/demo login (rotate before shared deployment): `admin@discovery.io` / `Admin#2026!`

**Data seeding & backups** — fresh deployments auto-load three init scripts:
`db/schema.sql` → `db/sample_data.sql` → `db/live_snapshot.sql` (a portable,
idempotent snapshot of real ingested tenders; regenerate anytime with
`python db/make_live_snapshot.py` while the stack is up). Full backups live in
`db/backups/`; create one with:
```bash
docker compose exec -T postgres pg_dump -U discovery discovery > db/backups/full_backup_$(date +%F).sql
```

---

## What's included — the 15 requested outputs

| # | Deliverable | Where |
|---|---|---|
| 1 | System Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 2 | Database Schema (3NF, UUID, FT search, partitioned) | [`db/schema.sql`](db/schema.sql), [`db/ER_DIAGRAM.md`](db/ER_DIAGRAM.md) |
| 3 | API Design | [`docs/API_DESIGN.md`](docs/API_DESIGN.md) |
| 4 | Folder Structure | this file (below) |
| 5 | Python Backend (FastAPI) | [`backend/`](backend/) |
| 6 | React Frontend | [`src/`](src/) (Next.js App Router) |
| 7 | Authentication (JWT + RBAC) | [`backend/app/security.py`](backend/app/security.py), [`backend/app/routers/auth.py`](backend/app/routers/auth.py) |
| 8 | API Connector Framework | [`backend/app/connectors`](backend/app/connectors), UI: `src/app/connectors` |
| 9 | Dashboard UI | [`src/app/page.tsx`](src/app/page.tsx) |
| 10 | Deployment Guide | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| 11 | Docker Configuration | [`Dockerfile`](Dockerfile), [`backend/Dockerfile`](backend/Dockerfile), [`docker-compose.yml`](docker-compose.yml) |
| 12 | Swagger / OpenAPI | built into FastAPI ([`backend/app/main.py`](backend/app/main.py)) → `/docs` (`/swagger-ui.html` redirects) |
| 13 | PostgreSQL Scripts | [`db/schema.sql`](db/schema.sql), [`db/sample_data.sql`](db/sample_data.sql) |
| 14 | Sample API Integrations | connector framework + seeded SAM.gov / TED / RSS sources |
| 15 | Production-ready source | entire repo — SOLID, MVC, repository pattern, tests |

---

## Modules (all implemented in the UI)

- **Dashboard** — totals, new today, closing soon, pipeline value; charts by country, technology, budget, source, category; recent + closing-soon lists.
- **Project Explorer** — advanced filters (country, state, category, technology, project type, status, organization, source, budget range), keyword search, quick tech chips, grid/table views, sorting, pagination, breadcrumbs.
- **Project Details** — full record: description, org, country, budget, deadlines, source, reference number, technologies, eligibility, contact, official link, **AI summary + tags**, and technology/category-matched recommendations.
- **API Connectors** — connector cards (auth, schedule, rate limit, pagination, retry, status), add-connector form, scheduler cadences, and live connector logs.
- **Smart Search** — global autocomplete over technologies, organizations, countries and projects.
- **AI Features** — summaries, technology/budget/deadline/org extraction, auto-categorization, tags, recommendations (surfaced on the details page; pipeline hooks in the backend).
- **Analytics** — projects per month, by country, by technology, win/loss, success rate, trending technologies, top organizations.
- **User Roles** — Administrator, Business Development, Sales, Manager, Read Only (role switcher + backend RBAC).
- **Theme** — polished light **and** dark mode.

---

## Tech stack

**Frontend** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · lucide-react
**Backend** Python 3.13+ · FastAPI · SQLAlchemy 2.0 · Pydantic v2 · PyJWT + bcrypt (JWT + RBAC) · APScheduler · psycopg 3
**Data** PostgreSQL 16 (partitioned, `tsvector` full-text, `pg_trgm`) · Redis · OpenSearch
**Ops** Docker · Nginx · Prometheus/Grafana · ELK · pytest

---

## Folder structure

```
.
├─ src/                              # Next.js frontend + route-handler API
│  ├─ app/
│  │  ├─ page.tsx                    # Dashboard
│  │  ├─ explorer/                   # Project Explorer (client + filters)
│  │  ├─ projects/[id]/              # Project Details
│  │  ├─ connectors/                 # API Connector module
│  │  ├─ analytics/                  # Analytics
│  │  ├─ api/                        # REST route handlers (backend contract)
│  │  ├─ layout.tsx · globals.css    # Shell, theme tokens
│  ├─ components/                    # Shell, charts, cards, UI primitives
│  └─ lib/                           # types · seed · repository · format
│
├─ backend/                         # Python FastAPI service
│  ├─ app/
│  │  ├─ models.py                   # SQLAlchemy entities (audit + soft delete)
│  │  ├─ repositories/               # query builders + composable filters
│  │  ├─ services/                   # application services
│  │  ├─ routers/                    # REST endpoints (projects, auth)
│  │  ├─ connectors/                 # SourceConnector framework
│  │  ├─ scheduler.py                # collection cadences (15m/hourly/daily)
│  │  ├─ security.py                 # JWT + BCrypt + RBAC dependencies
│  │  └─ main.py · config.py · database.py · errors.py · schemas.py
│  └─ tests/                         # pytest unit tests
│
├─ db/                              # schema.sql · sample_data.sql · ER_DIAGRAM.md
├─ docs/                            # ARCHITECTURE · API_DESIGN · DEPLOYMENT
├─ Dockerfile · backend/Dockerfile · docker-compose.yml
└─ README.md
```

---

## Non-functional highlights
Responsive UI · fast filtered search · JWT + RBAC · dark mode · audit logging ·
OpenAPI docs · scalable stateless services · SOLID / MVC / repository pattern ·
centralized exception handling · unit + integration (pytest) tests ·
**public-source-only** ingestion with de-duplication and change history.
