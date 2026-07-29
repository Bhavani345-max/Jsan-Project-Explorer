# Project Discovery Portal

An enterprise web application that helps a business-development team **discover
software development opportunities** — RFPs, RFQs, government tenders, IT
procurement notices, startup announcements and more — collected from
**publicly available sources only** (official public APIs, RSS feeds,
government procurement APIs, and open-data portals). No scraping of sites that
prohibit automated access.

> **The app runs right now with zero infrastructure** — a production-quality
> Next.js + TypeScript + Tailwind app with a repository-pattern data layer, so
> every module is demonstrable out of the box on a bundled sample dataset. Add a
> `DATABASE_URL` and it automatically upgrades to real, day-by-day ingested data.

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

With no database configured the portal serves the bundled sample dataset and the
sidebar reads "Sample dataset". Nothing else is required to explore every module.

---

## Live data (deployed architecture)

The deployed portal is **Vercel-native**: the Next.js app owns ingestion, storage
and reads — no separate service to run.

```
Vercel Cron (daily 02:00)
   └─→ GET /api/cron/ingest
         ├─ src/lib/ingest/connectors/*   fetch every public source concurrently
         ├─ src/lib/ingest/normalize.ts   FX→USD · categorize · tech extraction · fit score
         ├─ src/lib/db.ts                 idempotent upsert into Neon Postgres + purge expired
         └─ src/lib/ingest/ai-enrich.ts   optional summary polish (free OpenRouter models)

Page / API read path
   └─→ src/lib/live.ts → DB rows if any exist, else the bundled seed
         └─ src/lib/repository.ts (pure query logic over an injected dataset)
```

**Sources** (all public, no scraping):

| Source | Key required | Coverage |
|---|---|---|
| [UK Contracts Finder](https://www.contractsfinder.service.gov.uk) (OCDS) | no | UK public sector, OGL v3 |
| [EU TED](https://api.ted.europa.eu) (Search API v3) | no | 27 EU member states + EEA |
| [World Bank Projects](https://search.worldbank.org) | no | ~150 borrower countries |
| US SAM.gov | `SAM_GOV_API_KEY` | US federal — skipped silently without a key |

One failing source never blocks the others (`Promise.allSettled`), and every
record carries its official notice URL for provenance.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | for live data | Neon Postgres connection string (`POSTGRES_URL` also accepted) |
| `CRON_SECRET` | recommended | Gates `/api/cron/ingest`; Vercel Cron sends it as a bearer token |
| `OPENROUTER_API_KEY` | optional | Enables AI summary enrichment — free models by default |
| `OPENROUTER_ENRICH_MODEL` | optional | Comma-separated model fallback chain |
| `SAM_GOV_API_KEY` | optional | Enables the US SAM.gov connector |

Schema is created on demand (`ensureSchema()`), so a fresh Neon database needs no
migration step. Trigger the first ingest manually with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/ingest
```

Once any row lands, `/api/status` flips the sidebar to **"Live data connected"**.

---

## Reference enterprise backend (Python)

The repo also ships a complete **FastAPI + PostgreSQL + Redis + OpenSearch**
implementation under [`backend/`](backend/), wired for `docker compose up --build`.
It is the reference/enterprise deployment target — the Vercel path above is what
runs in production today. Quality audit: [`score.md`](score.md).

Dev/demo login (rotate before shared deployment): `admin@discovery.io` / `Admin#2026!`

**Data seeding & backups** (Docker stack only) — fresh deployments auto-load three
init scripts: `db/schema.sql` → `db/sample_data.sql` → `db/live_snapshot.sql`
(regenerate anytime with `python db/make_live_snapshot.py` while the stack is up).
Full backups live in `db/backups/`; create one with:
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
- **Analytics** — projects per month, by country, by technology, top technologies in demand, top organizations.
- **User Roles** — Administrator, Business Development, Sales, Manager, Read Only (role switcher + backend RBAC).
- **Theme** — polished light **and** dark mode.

---

## Tech stack

**Frontend** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · lucide-react
**Deployed backend** Next.js route handlers · Vercel Cron · Neon serverless Postgres (`@neondatabase/serverless`) · OpenRouter (optional AI enrichment)
**Reference backend** Python 3.13+ · FastAPI · SQLAlchemy 2.0 · Pydantic v2 · PyJWT + bcrypt (JWT + RBAC) · APScheduler · psycopg 3
**Data** PostgreSQL 16 (partitioned, `tsvector` full-text, `pg_trgm`) · Redis · OpenSearch
**Ops** Vercel · Docker · Nginx · Prometheus/Grafana · ELK · pytest

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
│  │  │  └─ cron/ingest/             # Vercel Cron entry point — the ingest run
│  │  ├─ layout.tsx · globals.css    # Shell, theme tokens
│  ├─ components/                    # Shell, charts, cards, UI primitives
│  └─ lib/
│     ├─ db.ts                       # Neon data access (schema, upsert, purge, reads)
│     ├─ live.ts                     # live-vs-seed dataset seam
│     ├─ repository.ts               # pure query logic over an injected dataset
│     ├─ ingest/
│     │  ├─ connectors/              # UK · EU TED · World Bank · SAM.gov
│     │  ├─ normalize.ts             # FX · categorize · tech · fit score · gates
│     │  └─ ai-enrich.ts             # optional OpenRouter summary polish
│     └─ types · seed · format · presence
│
├─ vercel.json                       # cron schedule + function maxDuration
├─ backend/                          # Python FastAPI service (reference stack)
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
