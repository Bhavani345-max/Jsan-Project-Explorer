# Deployment Guide

Two supported topologies. Both run the same code — only configuration differs.

```
DEVELOPMENT (docker compose up --build)      PRODUCTION
┌──────────────────────────────┐             ┌───────────────────────────┐
│ frontend  :3000  (Next.js)   │             │ Vercel — Next.js + API    │
│ backend   :8080  (FastAPI)   │             │   routes + Vercel Cron    │
│ postgres  :5432              │             └────────────┬──────────────┘
│ redis     :6379              │                          │ DATABASE_URL
│ opensearch:9200              │             ┌────────────▼──────────────┐
└──────────────────────────────┘             │ Railway PostgreSQL        │
                                             └────────────▲──────────────┘
                                                          │ DATABASE_URL
                                             ┌────────────┴──────────────┐
                                             │ Railway — FastAPI service │
                                             │   /api/v1 · /docs · /health│
                                             └───────────────────────────┘
```

> **How the two production services relate.** The Next.js app owns its own read
> and ingest path and queries Postgres directly — it does not call the FastAPI
> service at runtime. The FastAPI service is deployed alongside it on Railway as
> the independent `/api/v1` API (its own schema, auth and Swagger UI), sharing
> the same Railway PostgreSQL instance. Making the frontend consume FastAPI
> instead of the database is an application change, not a deployment change.

---

## 1. Deploy the database — Railway PostgreSQL

1. Create a project at [railway.app](https://railway.app) → **New Project**.
2. **+ New → Database → Add PostgreSQL**. Railway provisions the instance and
   exposes these variables on the service:

   | Variable | Use |
   |---|---|
   | `DATABASE_URL` | private URL (`postgres.railway.internal`) — for Railway services |
   | `DATABASE_PUBLIC_URL` | internet-reachable URL (`*.proxy.rlwy.net`) — for Vercel and local tools |

   Use the **private** URL between Railway services: it is faster and its
   traffic is not billed as egress. Vercel is outside Railway's network, so it
   must use the **public** URL.

3. Load the FastAPI schema. The ORM never emits DDL (`ddl-auto: validate`
   equivalent), so a fresh database starts empty and every `/api/v1` query fails
   until this runs once:

   ```bash
   python db/bootstrap_remote.py "<DATABASE_PUBLIC_URL>"
   # add --with-snapshot to also load the real ingested-tender snapshot
   ```

   The script enforces order (`schema.sql` → `sample_data.sql` →
   `live_snapshot.sql`) and refuses to run twice, because `sample_data.sql` has
   no `ON CONFLICT` clauses.

4. **The Next.js side needs no migration.** Its `opportunities` table is created
   on demand by `ensureSchema()` on the first ingest run. The two schemas
   coexist in the same database without touching each other.

---

## 2. Deploy the backend — Railway (FastAPI)

1. In the same Railway project: **+ New → GitHub Repo** → pick this repository.
2. **Settings → Root Directory: `backend`**. Railway then reads
   `backend/railway.json` and builds `backend/Dockerfile`.
3. **Variables** (Service → Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — a reference, so it tracks credential rotation |
   | `ALLOWED_ORIGINS` | `http://localhost:3000,https://<your-project>.vercel.app` |
   | `ALLOWED_ORIGIN_REGEX` | `^https://<your-project>-[a-z0-9-]+\.vercel\.app$` (optional, admits preview deployments) |
   | `JWT_SECRET` | 32+ bytes — `openssl rand -hex 32` |
   | `WEB_CONCURRENCY` | `2` (optional; uvicorn worker processes) |

   `PORT` and `RAILWAY_ENVIRONMENT` are injected automatically — do not set them.

4. **Settings → Networking → Generate Domain** to get
   `https://<service>.up.railway.app`.
5. Verify: `curl https://<service>.up.railway.app/health` → `{"status":"UP"}`,
   and open `/docs` for Swagger UI.

**Start command** (`backend/railway.json`):

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers ${WEB_CONCURRENCY:-2} \
        --proxy-headers --forwarded-allow-ips='*'
```

`--proxy-headers` is required behind Railway's edge, or the app builds `http://`
URLs on an `https://` deployment. Health checks hit `/health` (100s grace);
failed deploys restart up to 10 times.

---

## 3. Deploy the frontend — Vercel (Next.js)

```bash
npm i -g vercel      # if not installed
vercel link          # once, to bind the directory to a Vercel project
vercel --prod
```

Or import the repo at [vercel.com/new](https://vercel.com/new) — Next.js is
detected automatically; leave the build settings at their defaults.

**Environment variables** (Project → Settings → Environment Variables, set for
Production *and* Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Railway's **`DATABASE_PUBLIC_URL`** |
| `CRON_SECRET` | `openssl rand -hex 32` — gates `/api/cron/ingest` |
| `SAM_GOV_API_KEY` | optional; the US SAM.gov connector stays dormant without it |
| `NEXT_PUBLIC_API_BASE` | optional; `https://<service>.up.railway.app` |

The data layer picks its driver from the URL itself — a `*.neon.tech` host keeps
using Neon's HTTP driver, anything else (Railway, local Postgres) uses
node-postgres over TCP. Override with `DB_DRIVER=neon|pg` if detection is wrong.

After the first deploy, seed the database by triggering ingestion once:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/ingest
```

Once any row lands, `/api/status` flips the sidebar to **"Live data connected"**.

---

## 4. Scheduled ingestion — one scheduler, no duplicates

Ingestion exists in two implementations, and **only the Vercel one runs in
production**:

| Scheduler | Where | Status |
|---|---|---|
| Vercel Cron → `GET /api/cron/ingest` | `vercel.json`, daily 02:00 UTC | **active in production** |
| APScheduler (`backend/app/scheduler.py`) | inside the FastAPI process | **off on Railway**, on under Compose |

The FastAPI scheduler disables itself whenever `RAILWAY_ENVIRONMENT` is present
(`Settings.scheduler_active`), so the two can never collect the same sources
twice. No manual flag is needed; `SCHEDULER_ENABLED=true|false` overrides the
detection in either direction.

> If you enable it on Railway, also set `WEB_CONCURRENCY=1` — every uvicorn
> worker starts its own scheduler, so N workers means N runs of each job. The
> app logs a warning when it detects this combination.

---

## 5. Local development — Docker Compose (unchanged)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| Postgres | localhost:5432 (discovery/discovery) |
| OpenSearch | http://localhost:9200 |

Postgres auto-initializes from `db/schema.sql` + `db/sample_data.sql` +
`db/live_snapshot.sql`. Every value in `docker-compose.yml` is now an
environment variable defaulting to its previous literal, so the command above
behaves exactly as it always has. Override anything in a root `.env` file — see
`.env.example`.

Useful overrides:

```bash
FRONTEND_DATABASE_URL=postgresql://discovery:discovery@postgres:5432/discovery  # live read path locally
SCHEDULER_ENABLED=false          # stop the in-process collection cadences
BACKEND_PORT=8081                # free up 8080
```

The frontend can also run without any infrastructure — it falls back to the
bundled seed dataset:

```bash
npm install && npm run dev       # http://localhost:3000
```

---

## 6. Environment variables — full reference

### Frontend (Vercel / `.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | for live data | Postgres connection string. `POSTGRES_URL` accepted as an alias |
| `CRON_SECRET` | recommended | Bearer token gating `/api/cron/ingest`; Vercel Cron sends it automatically |
| `SAM_GOV_API_KEY` | optional | Enables the US SAM.gov connector |
| `DB_DRIVER` | optional | `neon` \| `pg` — force the driver instead of detecting from the host |
| `DB_POOL_MAX` | optional | node-postgres connections per warm instance (default 2) |
| `DB_SSL_REJECT_UNAUTHORIZED` | optional | `true` to verify the DB certificate (needs a trusted root via `PGSSLROOTCERT`) |
| `NEXT_PUBLIC_API_BASE` | optional | Public URL of the FastAPI service |
| `API_BASE` | optional | Server-side URL of the FastAPI service (compose: `http://backend:8080`) |

### Backend (Railway / `backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes (Railway) | Injected by the Postgres plugin; takes precedence over `DB_URL` |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | compose only | Legacy fallback; accepts the JDBC-style URL Compose passes |
| `ALLOWED_ORIGINS` | yes in prod | Comma-separated exact browser origins |
| `ALLOWED_ORIGIN_REGEX` | optional | Pattern for Vercel preview hostnames |
| `JWT_SECRET` | yes in prod | 32+ byte signing secret |
| `PORT` | injected | Railway assigns it; Compose leaves it unset and keeps 8080 |
| `WEB_CONCURRENCY` | optional | Uvicorn workers (default 1 locally, 2 on Railway) |
| `SCHEDULER_ENABLED` | optional | Overrides the automatic "off on Railway" behaviour |
| `DB_POOL_SIZE` / `DB_POOL_RECYCLE_SECONDS` | optional | Pool ceiling per worker; recycle window for proxied connections |
| `DB_SSLMODE` | optional | Appended to the URL (e.g. `require`) when the provider needs forced TLS |
| `REDIS_HOST` / `REDIS_PORT` | optional | Declared for the Compose stack; not contacted at runtime |

### Secrets checklist

- [ ] `JWT_SECRET` rotated away from the committed default.
- [ ] `CRON_SECRET` set on Vercel, so `/api/cron/ingest` is not world-callable.
- [ ] Dev login `admin@discovery.io` / `Admin#2026!` rotated before any shared deployment.
- [ ] `.env` / `.env.local` never committed (`.gitignore` and `.vercelignore` exclude `.env*`).
- [ ] Railway database credentials referenced as `${{Postgres.DATABASE_URL}}`, not pasted.

---

## 7. Alternative — self-managed reference topology

Kept for reference; nothing above depends on it.

```
Route53/DNS → CloudFront/Front Door (CDN, TLS)
            → ALB / App Gateway
               ├─ ECS Fargate / AKS: frontend (Next.js)      [2+ replicas]
               └─ ECS Fargate / AKS: backend (FastAPI)      [2+ replicas, HPA]
RDS PostgreSQL (Multi-AZ, read replica)  ·  ElastiCache/Azure Cache (Redis)
OpenSearch Service  ·  Amazon MQ / Service Bus (RabbitMQ)
Secrets Manager / Key Vault (JWT + connector credentials)
```

### CI/CD (GitHub Actions sketch)
1. `npm ci && npm run build` and `pytest` (backend unit + integration).
2. Build & push Docker images (frontend, backend) to ECR/ACR.
3. Apply `db/schema.sql` / SQL migrations as a pre-deploy job.
4. Rolling/canary deploy; health-gate on `/health` and `/`.

### Observability
- **Logs** → ELK (Filebeat → Elasticsearch → Kibana). On Railway/Vercel the
  platform log drains cover this.
- **Metrics** → Prometheus scrapes `/actuator/prometheus`; Grafana dashboards.
- **Tracing** → OpenTelemetry → Tempo/Jaeger.

### Security checklist
- [ ] Rotate `JWT_SECRET`; store in Secrets Manager/Key Vault.
- [ ] Connector credentials by reference only (never in DB/plaintext).
- [ ] TLS everywhere; HSTS at the edge.
- [ ] RBAC verified per role; audit log shipping enabled.
- [ ] DB least-privilege user; backups + PITR on the managed instance.
- [ ] WAF / rate limiting at the edge.
