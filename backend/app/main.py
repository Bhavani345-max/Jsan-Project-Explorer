"""
Project Discovery Portal — FastAPI entrypoint.

Endpoint paths, JSON shapes, env vars and port 8080 are identical to the
previous Spring Boot service, so the frontend, docker-compose and monitoring
keep working unchanged:

  • /api/v1/projects, /api/v1/projects/{id}, /api/v1/auth/login
  • /swagger-ui.html (redirect) + /v3/api-docs (OpenAPI JSON)
  • /actuator/health (compat alias) + /health
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import scheduler
from app.config import get_settings
from app.errors import register_exception_handlers
from app.routers import ai, auth, projects

logging.basicConfig(level=logging.INFO)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()   # data-collection cadences: 15m / hourly / daily
    yield
    scheduler.shutdown()


app = FastAPI(
    title="Project Discovery Portal API",
    description="Discover and inspect software opportunities from public sources",
    version="1.0.0",
    openapi_url="/v3/api-docs",
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(ai.router)


@app.get("/swagger-ui.html", include_in_schema=False)
def swagger_compat():
    return RedirectResponse("/docs")


@app.get("/health", include_in_schema=False)
@app.get("/actuator/health", include_in_schema=False)
def health():
    return {"status": "UP"}
