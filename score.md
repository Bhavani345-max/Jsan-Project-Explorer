# Platform Quality Score — Rubric Testing

Iterative deep review of the Project Discovery Portal. Each round: find issues →
fix → re-score. Scores are 1–5 per category (5 = production-grade, verified).

**Scoring rounds:** R1 = baseline audit · R2 = real data connector · R3 = deep
review fixes · R4 = final smoke test

---

## Rubric

| # | Category | What 5/5 means |
|---|---|---|
| 1 | **Data authenticity** | Opportunities come from live public APIs; every record traceable to a real, resolvable official notice URL |
| 2 | **Ingestion robustness** | Connector handles retries, timeouts, rate limits, pagination, malformed records; idempotent re-runs (dedup) |
| 3 | **API correctness** | Endpoints honor the documented contract: filters, sorting, pagination envelope, error shapes |
| 4 | **Security** | JWT + RBAC enforced on every route; bcrypt; no credential leaks; auth failures don't leak information |
| 5 | **Data integrity** | ORM matches SQL schema exactly; soft delete respected everywhere; audit columns work; no orphaned rows |
| 6 | **Transparency** | Sample vs real data clearly labeled; docs match reality; no misleading claims |
| 7 | **Test coverage** | Unit + E2E tests exist, pass, and cover the paths that matter |

---

## Round 1 — Baseline audit (before real connector)

| # | Category | Score | Findings |
|---|---|---|---|
| 1 | Data authenticity | **1/5** | ALL opportunity data is hand-authored sample data (53 UI records in `src/lib/seed.ts`, 2 DB rows in `db/sample_data.sql`). Titles, budgets, reference numbers, contacts are fictional. Zero live API calls anywhere. |
| 2 | Ingestion robustness | **1/5** | Connector *framework* exists (`SourceConnector` ABC, scheduler with 3 cadences, dedup logic) but `CONNECTORS` registry is **empty** — the scheduler runs every 15 min and does nothing. No retry/rate-limit code exists because nothing fetches. |
| 3 | API correctness | **4/5** | 21/21 E2E tests passed (filters, sorting, Spring-Page envelope, 404 problem+json). Not yet re-verified after connector changes. |
| 4 | Security | **4/5** | JWT+RBAC verified by E2E tests. Issues: dev JWT secret/db password defaults in compose (acceptable for dev, flagged); login does no dummy bcrypt when user not found (timing side-channel, minor). |
| 5 | Data integrity | **3/5** | One schema mismatch already caught & fixed during Docker testing (audit columns on lookup tables). `budget_usd` column stores native currency amounts (GBP stored in a column named *usd*) — naming anomaly. Soft-delete verified working via live DB test. |
| 6 | Transparency | **2/5** | Executive brief correctly warns data is sample. BUT the brief claims *"A visible 'Sample dataset' marker is shown in the app"* — **needs verification** the marker actually exists in the UI. |
| 7 | Test coverage | **3/5** | 5 unit + 21 E2E passing. No connector tests (nothing to test yet), no ingestion round-trip test. |

**Round 1 total: 18/35 (51%)**

### Live API probe (evidence for R2 direction)
`GET contractsfinder.service.gov.uk/Published/Notices/OCDS/Search` (no key, official
Cabinet Office OCDS feed, Open Government Licence v3) returned **5 real tenders
published 2026-07-22/23**, e.g.:
- "Supply Chain Notice: WC1857725" — **Ministry of Defence**, £2,500,000, deadline 2026-07-27
- "Peckham - Distribution board replacements" — Harris Federation, £150,000
- Each with a resolvable `contractsfinder.service.gov.uk/Notice/<uuid>` URL

→ Round 2: implement `ContractsFinderConnector` against this feed.

---

## Round 2 — Live connector + API interceptor

### What was built
1. **`ContractsFinderConnector`** (`backend/app/connectors/contracts_finder.py`) —
   first live source, against the official Cabinet Office OCDS feed (no key,
   Open Government Licence v3). Retry w/ exponential backoff, 429 handling,
   pagination w/ page cap, rate-budget sleeps, per-record error isolation,
   get-or-create for organizations/source, keyword auto-categorization.
2. **`ApiInterceptor`** (`backend/app/connectors/interceptor.py`) — httpx
   event-hook capture layer. Records method/URL/status/latency/bytes and a
   SHA-256 of every raw response; writes raw payloads to `CONNECTOR_CAPTURE_DIR`.
   Every DB row is traceable to the exact raw API response it came from.

### Forensic validation (anti-hallucination) — 18/18 PASS
| Check | Result |
|---|---|
| Fetched non-trivial batch | ✅ 17 live tenders |
| Every reference is a genuine OCDS ocid (`ocds-b5fd17-*`) | ✅ 17/17 |
| Publication dates within fetch window | ✅ |
| Deadlines ≥ publication date (no time travel) | ✅ 17/17 |
| Budgets positive, currency GBP | ✅ 15 with budgets |
| Unique source hashes | ✅ |
| Official notice URLs resolve on gov.uk | ✅ 5/5 sampled (403 for bots, 200 for browser UA — bot protection on human pages; API is the sanctioned channel) |
| **Live gov.uk pages display the same tender titles we ingested** | ✅ 5/5 — direct proof data is not fabricated |
| Interceptor captured every call, 200s only | ✅ |
| Raw capture files match intercept-time SHA-256 (tamper-evident) | ✅ |

### Dockerized ingestion — verified
- `run('Public Tender API')` inside the container ingested **16 real tenders**
  into PostgreSQL (MoD £2.5M supply-chain notice, Southend City Council,
  Yeovil College, Harris Federation…), joined to auto-created organizations.
- **Second run upserted 0** → source-hash dedup is idempotent. ✅
- Raw captures present in container at `/tmp/captures` (109 KB each). ✅
- Existing seeded source row "UK Contracts Finder" was correctly *reused*
  (get-or-create), not duplicated. ✅

### Round 2 scores
| # | Category | R1 | R2 | Why |
|---|---|---|---|---|
| 1 | Data authenticity | 1 | **4** | DB now holds real, traceable tenders; UI still renders its own sample set (2 sample DB rows also remain) |
| 2 | Ingestion robustness | 1 | **4** | Retry/backoff/429/pagination/rate budget/dedup all implemented & live-tested; no connector unit tests yet |
| 3 | API correctness | 4 | **4** | Unchanged; E2E re-run pending (R4) |
| 4 | Security | 4 | **4** | Unchanged; login timing side-channel still open |
| 5 | Data integrity | 3 | **4** | Live ingestion respected FKs, partitioning, dedup; `budget_usd` naming anomaly remains (stores native-currency amount; `currency` column disambiguates) |
| 6 | Transparency | 2 | **4** | "Sample dataset" marker verified present in UI (`Shell.tsx:128`); interceptor provides provenance evidence |
| 7 | Test coverage | 3 | **3** | Forensic validation is a script, not a repeatable test; connector needs offline unit tests |

**Round 2 total: 27/35 (77%)** — up from 18/35

### Issues carried to Round 3
- [ ] Login timing side-channel: no dummy bcrypt when user not found
- [ ] Connector has no offline unit tests (use captured raw JSON as fixture)
- [ ] E2E suite asserts exact count `totalElements == 2` — brittle now that live data flows
- [ ] `config.sqlalchemy_url` breaks if DB password contains `@` (dev-only concern)
- [ ] UI renders its own seed, not the live DB (documented reference-app design; marker present)

---

## Round 3 — Deep review fixes

| Issue | Fix | Verified by |
|---|---|---|
| Login timing side-channel (bcrypt skipped for unknown users → email enumeration) | Constant-work dummy-hash comparison in `routers/auth.py` | E2E: "login unknown user -> same 401" |
| No offline connector tests | `tests/test_contracts_finder.py` — 8 tests running against the **real captured API payload** as fixture (mapping, hash stability & change-sensitivity, malformed-record isolation, status map, tz parsing, categorization) | 13/13 unit tests pass |
| E2E asserted exact row counts (brittle with live data) | Rewritten as invariants: filters assert *properties of results* (all rows match the filter) plus known-record presence | 24/24 E2E pass |
| `sqlalchemy_url` broke on passwords containing `@ : / #` | Credentials now URL-encoded via `urllib.parse.quote` | unit run + container boot |
| Capture dir unwritable for non-root container user | `ENV CONNECTOR_CAPTURE_DIR=/tmp/captures` in Dockerfile | captures verified present in container |

---

## Round 4 — Final smoke test (full dockerized stack)

- **Unit: 13/13 pass** (filters, query caps, connector mapping on real captured payload)
- **E2E: 24/24 pass** against `docker compose` stack — health, OpenAPI, frontend,
  401/403/404 problem+json, login (wrong password / unknown user / success),
  Spring-Page envelope, live + sample data coexistence, 6 filter invariants,
  sorting, pagination arithmetic, detail fetch of a LIVE tender by id.
- DB state at final run: **18 projects = 16 live UK tenders + 2 labeled samples**;
  hourly scheduler continues ingesting automatically.

## Final scores

| # | Category | R1 | R2 | Final | Remaining gap |
|---|---|---|---|---|---|
| 1 | Data authenticity | 1 | 4 | **4** | Backend/API data fully real & traceable; the reference UI still renders its own labeled sample set (documented design; "Sample dataset" marker shown) |
| 2 | Ingestion robustness | 1 | 4 | **5** | — |
| 3 | API correctness | 4 | 4 | **5** | — |
| 4 | Security | 4 | 4 | **5** | (prod deployment still needs real secrets — dev defaults documented) |
| 5 | Data integrity | 3 | 4 | **4** | `budget_usd` column stores native-currency amounts (GBP); schema rename deferred — `currency` column disambiguates |
| 6 | Transparency | 2 | 4 | **5** | — |
| 7 | Test coverage | 3 | 3 | **5** | — |

**FINAL: 33/35 (94%)** — up from 18/35 (51%) baseline.

### Provenance chain (how we know nothing is hallucinated)
1. `ApiInterceptor` records every outbound call: URL, status, latency, bytes, SHA-256 of raw body.
2. Raw payloads persisted to `CONNECTOR_CAPTURE_DIR` — DB rows trace to exact API responses.
3. Forensic validation resolved sampled `official_link` URLs on gov.uk **and confirmed the live pages display the same tender titles we ingested** (5/5).
4. Unit tests run the mapper against the captured payload, so CI keeps validating against real data shapes offline.

### Known, accepted limitations
- Frontend reference UI reads its own seed (per original two-part design), clearly marked "Sample dataset — demo data". Wiring it to the live backend is the natural next step.
- Sample rows (`SAM-2026-4820`, `UKCF-2026-4827`) remain in the DB for demo continuity; they are distinguishable by non-`ocds-` reference numbers.
- Dev credentials (`discovery`/`discovery`, default JWT secret) must be replaced before shared deployment.

---

## Round 5 — Completion: UI wired to live data

The last accepted limitation is now closed:

| Change | File |
|---|---|
| Server-side backend client: service-account login w/ cached token, camelCase mapping, JSAN presence/fit/service-line enrichment, 4s timeout + graceful fallback to samples | `src/lib/backend.ts` |
| `/api/projects` tries live backend first, falls back to seed (keeps zero-infra demo working); response carries `live: true/false` | `src/app/api/projects/route.ts` |
| `/api/projects/[id]` serves live tenders by UUID, samples by seed id | `src/app/api/projects/[id]/route.ts` |
| `/api/status` health probe | `src/app/api/status/route.ts` |
| Sidebar marker now dynamic: green "**Live data connected** · UK Contracts Finder · OCDS API" when backend up, amber "Sample dataset" otherwise | `src/components/Shell.tsx` |
| Real bcrypt hashes seeded so fresh deploys work out of the box (dev creds documented in the SQL) | `db/sample_data.sql` |
| `API_BASE=http://backend:8080` for in-network server-side calls | `docker-compose.yml` |

### Verified end-to-end through the UI's own API
- `GET :3000/api/status` → `{"live": true}`
- `GET :3000/api/projects?country=United Kingdom` → `live: true`, **17 real tenders**
  (scheduler had already ingested more on its own — East Sussex CC, Heathrow Airport Ltd)
- `GET :3000/api/projects/<uuid>` → real **Ministry of Defence £2.5M** notice with
  gov.uk link, presence tier "Headquarters · UK HQ · Brentford", fit score computed
- Sample-id fallback still works; zero-infra mode (`npm run dev`, no Docker) still works
- Regression: **13/13 unit + 24/24 E2E still passing**

### Updated final scores

| # | Category | R1 | Final | 
|---|---|---|---|
| 1 | Data authenticity | 1 | **5** — UI now renders live ingested tenders; marker switches automatically |
| 2 | Ingestion robustness | 1 | **5** |
| 3 | API correctness | 4 | **5** |
| 4 | Security | 4 | **5** (dev creds documented & isolated; rotate for shared deploys) |
| 5 | Data integrity | 3 | **4** — `budget_usd` naming anomaly remains (documented) |
| 6 | Transparency | 2 | **5** |
| 7 | Test coverage | 3 | **5** |

**FINAL: 34/35 (97%)** — from 18/35 (51%) baseline.

Remaining (documented, deliberate):
- `budget_usd` stores native-currency amounts; renaming the column is a schema
  migration best done alongside a real FX-normalization feature.
- Demo credentials and JWT secret must be rotated before shared deployment.

---

## Round 6 — Bulk seeding & data dump

- **Backfill ingestion:** 14-day + 90-day passes → **885 projects (883 real UK
  tenders), 262 organizations**, Apr–Jul 2026, 100% full-text indexed. All raw
  responses captured by the interceptor (12 API calls, ~7.9 MB evidence).
- **`db/live_snapshot.sql`** — portable idempotent seed (auto-loaded on fresh
  deploys as init script 03); regenerate with `db/make_live_snapshot.py`.
- **`db/backups/`** — full pg_dump backups.
- **Two real bugs caught by scratch-DB seed testing:**
  1. Hard-coded `category_id` UUIDs broke on fresh deploys (categories get new
     UUIDs each install) → snapshot now resolves categories **by name**.
  2. Windows text-mode newline translation corrupted SQL string literals — a
     400-char title with embedded newlines overflowed VARCHAR(400) on reload →
     generator writes `newline="\n"`; connector now normalizes title whitespace;
     existing rows cleaned.
- Verified: fresh scratch DB seeds **885/885 rows**, applied twice without error;
  13/13 unit + 24/24 E2E still green.
