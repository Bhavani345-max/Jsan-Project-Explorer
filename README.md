# JSAN_NexusAI_Enterprise_Growth_Platform

An enterprise web application that helps a business-development team **discover
geospatial and telecom engineering opportunities** — RFPs, RFQs, government
tenders and public procurement notices — collected from **publicly available
sources only** (official public APIs, government procurement APIs, and
open-data portals). No scraping of sites that prohibit automated access.

## Scope: geospatial, telecom, and closely related work

The portal carries three service lines — **Geospatial Intelligence**, **Telecom
& Network Engineering**, and **Geospatial & Telecom Adjacent**. Generic software
development, health, education, finance, agriculture, energy and construction
notices are filtered out. [`src/lib/domain.ts`](src/lib/domain.ts) is the single
source of truth; widening the portal is a one-line change there.

The adjacent line is work in the same field that isn't a pure GIS or telecom
contract — earth observation, digital twins, BIM, IoT and sensor networks,
SCADA/telemetry, spectrum and emergency communications, and national
digital-infrastructure programmes. It is a **separate** line rather than being
folded into the two core ones so capability-fit scores stay meaningful: adjacent
work scores +20, against +30 for core, so a national digital programme never
outranks a real fibre build.

### Worldwide by design — no location preference

The scope says nothing about *where* an opportunity is. Every country a source
reports is carried and appears in the Explorer's Country filter (which shows its
own count, so the coverage is visible rather than something you scroll to find).

An earlier version ranked results by JSAN's office footprint — a
`presenceTier`/`presenceRank` on every record, a "JSAN Location Priority" filter,
and a default sort that put office countries first. That has been **removed**:
where JSAN happens to have an office is not a property of the opportunity, and
ranking by it pushed every other country onto the back pages. Default ranking is
now **capability fit, then nearest deadline**. Narrow by location with the
Country filter instead.

The filter runs in two stages, because neither alone is sufficient:

1. **At the source** — connectors request only narrow, domain-specific CPV
   families (fibre optic cables, telecom services, GIS, cadastral and
   topographical surveying). The broad families `72000000` (IT services) and
   `48000000` (software packages) were removed: they carry ~640k notices
   between them and accounted for essentially all off-domain noise.
2. **Locally** — every record is re-checked against the categorizer before it
   is persisted. CPV only narrows the funnel; a TED notice carries several CPV
   codes, so a telecom code can still arrive attached to medical equipment.

Measured against live TED, the same 120 notices fetched: **3% in-domain before,
42% after**.

The vocabulary is maintained by auditing what the store is *wrongly hiding*, not
by loosening the rules. TED renders every title as
`Country – <English CPV label> – <native title>`, so the CPV wording is always
present and worth matching directly ("Telephone and data transmission services");
a few high-value native terms are matched too, since the native half is often the
only place the work is described — German *Breitbandausbau* (broadband rollout)
and French *boucle optique locale* (local optical loop) were both being missed.
Re-running the classifier over 436 stored rows after the most recent audit
promoted **10** records and reinterpreted none.

Bare `digitalisation` is deliberately **not** matched: across TED it
overwhelmingly means scanning paper records, not building infrastructure. Only
programme-shaped phrasings are ("Chad Digital Transformation Project").

Nothing is ever deleted to achieve this. Out-of-domain records already
collected are retained in the database and simply not selected — reads filter
in SQL, so paging and limits stay correct.

### Paging the result set

The store currently answers the Explorer's default view with **467 in-domain
opportunities — 52 pages** at nine per page. The earlier control rendered one
button per page, so all 52 were laid out inline and wrapped over several rows;
the numbers also shifted under the cursor on every click as the row re-flowed.

[`src/components/Pagination.tsx`](src/components/Pagination.tsx) renders a fixed
seven slots instead — first page, last page, a window around the current one,
and `…` for the runs between — so the control keeps its width and **Next** stays
where you last clicked it. An ellipsis is never used to hide a *single* page,
since `…` is no narrower than `7`. Page size is selectable (9 / 18 / 36 / 60),
and past ten pages a "go to page" box appears, because stepping to page 40 with
**Next** is not a real option.

Paging state lives in the address bar alongside the filters, so a view can be
shared, bookmarked, and survives a reload. It is written with `replaceState`
rather than `pushState`: paging is not a navigation, and one history entry per
page click would make **Back** useless for leaving the Explorer.

Two failure modes are handled in the data layer rather than the UI. A page past
the end — a stale bookmark, or the page you were on when a filter narrowed the
results — is **clamped to the last page that exists** by `queryProjects`, which
reports the page it actually served so the control corrects itself; serving an
empty slice would have read as "no opportunities found". And `pageSize` is
bounded in the API route, so a hand-typed `?pageSize=100000` cannot serialise
the whole store into one response.

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
and reads. The FastAPI service deploys separately to Railway and serves its own
`/api/v1` contract; the portal does not call it at runtime.

```
Vercel (Next.js + API routes + Cron) ─┐
                                      ├─→ PostgreSQL   (Railway or Neon — the
Railway (FastAPI /api/v1) ────────────┘                 URL selects the driver)
```

```
Vercel Cron (daily 02:00)
   └─→ GET /api/cron/ingest
         ├─ src/lib/ingest/connectors/*   fetch every public source concurrently
         ├─ src/lib/ingest/normalize.ts   FX→USD · categorize · tech extraction · fit score
         ├─ src/lib/db.ts                 idempotent upsert into Postgres + purge expired
         └─ src/lib/ingest/translate.ts   derive English titles from the published CPV label

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
| `DATABASE_URL` | for live data | Postgres connection string — Railway or Neon (`POSTGRES_URL` also accepted) |
| `CRON_SECRET` | recommended | Gates `/api/cron/ingest`; Vercel Cron sends it as a bearer token |
| `SAM_GOV_API_KEY` | optional | Enables the US SAM.gov connector |
| `DB_DRIVER` | optional | `neon` \| `pg` — override the driver auto-detected from the host |

The connection string alone selects the driver: a `*.neon.tech` host uses Neon's
HTTP driver, any other host uses node-postgres over TCP. Full variable reference
and step-by-step deploys: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Schema is created on demand (`ensureSchema()`), so a fresh database needs no
migration step. Trigger the first ingest manually with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/ingest
```

Once any row lands, `/api/status` flips the sidebar to **"Live data connected"**.

### English translation

93% of collected notices are not in English — TED renders every title as
`Country – <English CPV label> – <native title>`, and that native tail arrives in
Polish, Lithuanian, French, Croatian, Spanish, German and 20-odd others.

Translation runs **server-side at ingest** and is stored, because the portal's job
is discovery: the Explorer's keyword search and the facets both read the stored
title. A client-side page widget (GTranslate and similar) translates what is
painted on screen and leaves both of those monolingual — searching "cadastral
survey" would still never match `kadastrinių matavimų`.

The original is never overwritten. It stays in `title`, the translation lands in
`title_en`, and the read layer prefers the translation while keeping the original
searchable and shown on the details page — these are official notices and must
remain citable. Search therefore works in **both** languages: `cadastral` and
`kadastrini` each find the Lithuanian notice.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/cron/translate?limit=150"
```

Ingest processes a small batch each run for upkeep; the endpoint above clears a
backlog and is safe to call repeatedly. Only in-domain rows are processed —
retained out-of-domain records are never shown.

English titles are **derived, not translated**: TED publishes every title as
`Country – English CPV label – native title`, so the English wording is already
in the source record and is simply extracted. No model is involved, and the
original title is never overwritten.

### Language switcher (GTranslate)

The sticky topbar carries a [GTranslate](https://gtranslate.io) dropdown
([`src/components/GTranslate.tsx`](src/components/GTranslate.tsx)) that renders
the finished English page in the visitor's own language. It is the **opposite
direction** to the ingest translation above, and the two are complementary:

| | Direction | Where | Persisted |
|---|---|---|---|
| `lib/ingest/translate.ts` | foreign notice data → **English** | server, at ingest | yes — search and facets both read it |
| `components/GTranslate.tsx` | English page → **visitor's language** | browser, on demand | no |

Only the widget is client-side, and deliberately so: it cannot do the ingest
job, because it rewrites rendered text rather than stored text, so a server-side
search for `cadastral survey` would still never match `kadastrinių matavimų`.

Anything that must survive a language switch is marked `notranslate` — the
original published title on the details page (it exists precisely to show the
buyer's own wording) and record identifiers, which get quoted back to buyers
verbatim. Add that class to anything else that must stay literal.

No key or account is needed; the widget is loaded from GTranslate's CDN on the
client. Note that it sends page text to the translation service — everything in
this portal is already public-source data, but it is worth knowing before adding
anything private to a page. Remove the `<GTranslate />` line in
[`src/components/Shell.tsx`](src/components/Shell.tsx) to drop it entirely.

### Re-classifying stored records

After tuning the categorizer, `/api/cron/reclassify` re-runs it across rows
already stored and promotes any that are really geospatial or telecom work.
Preview first — it writes nothing with `dryRun`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/cron/reclassify?dryRun=1"
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/reclassify
```

It is `UPDATE`-only and **promote-only**: no row is deleted, and a record
already in the target domain is never demoted out of it, so nothing visible can
disappear. Rows the current rules disagree with are reported for review rather
than changed. Classification here reads the **title only** — deliberately
stricter than ingest, since long project abstracts mention "network" or
"broadband" in passing and drag in unrelated programmes.

---

## Enterprise backend (Python)

The repo also ships a complete **FastAPI + PostgreSQL + Redis + OpenSearch**
implementation under [`backend/`](backend/), wired for `docker compose up --build`
locally and for **Railway** in production (`backend/railway.json`, Root Directory
`backend`). It serves the `/api/v1` contract, JWT auth and Swagger UI
independently of the portal's own read path. Its in-process collection scheduler
is disabled automatically on Railway so it can never duplicate the Vercel Cron
ingest. Quality audit: [`score.md`](score.md).

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

- **Dashboard** — totals, countries covered, best-fit count, closing soon, pipeline value; per-service-line shortcuts whose counts are derived from the same filter as the link they open; real monthly discovery trend from publication dates; charts by country, technology, budget, source, category; recent + closing-soon lists. No invented period-over-period deltas — the store keeps no historical snapshots, so there is nothing real to compare against.
- **Project Explorer** — advanced filters (country, state, category, service line, technology, project type, status, organization, source, budget range), keyword search, quick tech chips, grid/table views, sorting, breadcrumbs, and windowed pagination with a selectable page size, shareable URL state and clamping on out-of-range pages (see [Paging the result set](#paging-the-result-set)).
- **Project Details** — full record: description, org, country, budget, deadlines, source, reference number, technologies, eligibility, contact, official link, **source summary + tags**, and technology/category-matched related opportunities.
- **API Connectors** — connector cards (auth, schedule, rate limit, pagination, retry, status), add-connector form, scheduler cadences, and live connector logs.
- **Smart Search** — global autocomplete over technologies, organizations, countries and projects.
- **Rule-Based Scoring** — keyword, budget, country and deadline rules produce a 0–100 fit score, shown on the details page as the exact arithmetic that produced it (`src/lib/scoring.ts`).
- **Analytics** — projects per month, by country, by technology, top technologies in demand, top organizations.
- **User Roles** — Administrator, Business Development, Sales, Manager, Read Only (role switcher + backend RBAC).
- **Theme** — polished light **and** dark mode.

---

## Tech stack

**Frontend** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · lucide-react · **Segoe UI** (system font — nothing is downloaded; it replaced an Inter webfont that was fetched on every cold load)
**Deployed backend** Next.js route handlers · Vercel Cron · Postgres via `@neondatabase/serverless` (Neon hosts) or `pg` (Railway, self-hosted)
**API service** Python 3.13+ · FastAPI · SQLAlchemy 2.0 · Pydantic v2 · PyJWT + bcrypt (JWT + RBAC) · APScheduler · psycopg 3 · uvicorn
**Data** PostgreSQL 16 (partitioned, `tsvector` full-text, `pg_trgm`) · Redis · OpenSearch
**Ops** Vercel · Railway · Docker · Nginx · Prometheus/Grafana · ELK · pytest

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
│  │  └─ Pagination.tsx              # windowed page control + page-size select
│  └─ lib/
│     ├─ db.ts                       # Postgres data access (Neon HTTP or pg/TCP; schema, upsert, purge, reads)
│     ├─ live.ts                     # live-vs-seed dataset seam
│     ├─ repository.ts               # pure query logic over an injected dataset
│     ├─ ingest/
│     │  ├─ connectors/              # UK · EU TED · World Bank · SAM.gov
│     │  ├─ normalize.ts             # FX · categorize · tech · fit score · gates
│     └─ domain.ts · types · seed · format
│
├─ vercel.json                       # cron schedule + function maxDuration
├─ .env.example                      # frontend / compose env template
├─ backend/                          # Python FastAPI service (deploys to Railway)
│  ├─ railway.json                   # Railway builder, start command, healthcheck
│  ├─ .env.example                   # backend env template
│  ├─ app/
│  │  ├─ models.py                   # SQLAlchemy entities (audit + soft delete)
│  │  ├─ repositories/               # query builders + composable filters
│  │  ├─ services/                   # application services
│  │  ├─ routers/                    # REST endpoints (projects, auth)
│  │  ├─ connectors/                 # SourceConnector framework
│  │  ├─ scheduler.py                # collection cadences (15m/hourly/daily; off on Railway)
│  │  ├─ security.py                 # JWT + BCrypt + RBAC dependencies
│  │  └─ main.py · config.py · database.py · errors.py · schemas.py
│  └─ tests/                         # pytest unit tests
│
├─ db/                              # schema.sql · sample_data.sql · ER_DIAGRAM.md
│                                   # + bootstrap_remote.py (load schema into Railway)
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
