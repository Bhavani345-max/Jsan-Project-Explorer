"""
JSAN_NexusAI_Enterprise_Growth_Platform — FastAPI entrypoint.

Endpoint paths, JSON shapes, env vars and port 8080 are identical to the
previous Spring Boot service, so the frontend, docker-compose and monitoring
keep working unchanged:

  • /api/v1/projects, /api/v1/projects/{id}, /api/v1/auth/login
  • /swagger-ui.html (redirect) + /v3/api-docs (OpenAPI JSON)
  • /actuator/health (compat alias) + /health

Deployment: this service runs on Railway (Dockerfile + backend/railway.json),
listening on the injected $PORT and reading DATABASE_URL from the Railway
Postgres plugin. /health is the platform healthcheck path.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import scheduler
from app.config import get_settings
from app.errors import register_exception_handlers
from app.routers import auth, projects

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("discovery.main")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # data-collection cadences: 15m / hourly / daily.
    #
    # Skipped on Railway, where Vercel Cron owns ingestion — running both would
    # collect every source twice. See Settings.scheduler_active.
    if settings.scheduler_active:
        if int(os.getenv("WEB_CONCURRENCY", "1")) > 1:
            log.warning(
                "Scheduler is enabled with WEB_CONCURRENCY>1 — each worker "
                "process starts its own scheduler and jobs will run more than "
                "once. Run a single worker, or set SCHEDULER_ENABLED=false."
            )
        scheduler.start()
        log.info("Data-collection scheduler started")
    else:
        log.info(
            "Data-collection scheduler disabled for this environment "
            "(ingestion is owned by the Vercel Cron job)"
        )
    yield
    if settings.scheduler_active:
        scheduler.shutdown()


app = FastAPI(
    title="JSAN_NexusAI_Enterprise_Growth_Platform API",
    description="Discover and inspect opportunities from public procurement sources",
    version="1.0.0",
    openapi_url="/v3/api-docs",
    docs_url="/docs",
    lifespan=lifespan,
)

# Development origin comes from the default (http://localhost:3000); production
# adds the Vercel domain through ALLOWED_ORIGINS, and per-deployment preview
# hostnames — which cannot be enumerated ahead of time — through
# ALLOWED_ORIGIN_REGEX. allow_credentials forbids the "*" wildcard, so both are
# explicit lists rather than a catch-all.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.allowed_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth.router)
app.include_router(projects.router)


@app.get("/swagger-ui.html", include_in_schema=False)
def swagger_compat():
    return RedirectResponse("/docs")


@app.get("/health", include_in_schema=False)
@app.get("/actuator/health", include_in_schema=False)
def health():
    return {"status": "UP"}
