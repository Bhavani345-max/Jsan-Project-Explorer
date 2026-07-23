# Deployment Guide

## Option A — Reference app on Vercel (fastest)
The Next.js app is self-contained (in-memory repository, route-handler API).

```bash
npm install
npm run dev          # http://localhost:3000
# or deploy
npx vercel           # preview
npx vercel --prod    # production
```
No database or env vars required for the demo. To point the UI at the FastAPI
Boot backend, set `NEXT_PUBLIC_API_BASE` in Vercel project settings.

## Option B — Full stack with Docker Compose
Brings up PostgreSQL, Redis, OpenSearch, the FastAPI backend and the Next.js UI.

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

Postgres auto-initializes from `db/schema.sql` + `db/sample_data.sql`.

## Option C — Production (AWS / Azure) reference topology
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
4. Rolling/canary deploy; health-gate on `/actuator/health` and `/`.

### Observability
- **Logs** → ELK (Filebeat → Elasticsearch → Kibana).
- **Metrics** → Prometheus scrapes `/actuator/prometheus`; Grafana dashboards.
- **Tracing** → OpenTelemetry → Tempo/Jaeger.

### Security checklist
- [ ] Rotate `JWT_SECRET`; store in Secrets Manager/Key Vault.
- [ ] Connector credentials by reference only (never in DB/plaintext).
- [ ] TLS everywhere; HSTS at the edge.
- [ ] RBAC verified per role; audit log shipping enabled.
- [ ] DB least-privilege user; backups + PITR on RDS.
- [ ] WAF / rate limiting at the edge.

## Environment variables
| Var | Component | Example |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | backend | `jdbc:postgresql://…/discovery` |
| `REDIS_HOST` / `REDIS_PORT` | backend | `redis` / `6379` |
| `JWT_SECRET` | backend | 32+ byte secret |
| `NEXT_PUBLIC_API_BASE` | frontend | `https://api.discovery.io` |
