"""
Application settings — every value is overridable via environment variables.

Two deployment targets are supported from one set of names:

  • docker-compose (unchanged)  DB_URL, DB_USER, DB_PASSWORD, REDIS_HOST,
                                REDIS_PORT, JWT_SECRET
  • Railway                     DATABASE_URL (injected by the Postgres plugin),
                                PORT, ALLOWED_ORIGINS

DATABASE_URL wins when both are present, so a Railway service needs no manual
database wiring while compose keeps working with the variables it already sets.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    app_name: str = "JSAN_NexusAI_Enterprise_Growth_Platform"

    # Managed providers (Railway, Render, Fly, Heroku) inject a single
    # credentials-bearing URL under this name. Empty means "not set".
    database_url: str = ""

    # Accepts either a JDBC-style URL (jdbc:postgresql://host:5432/db — what
    # docker-compose passes) or a plain SQLAlchemy URL. Used when DATABASE_URL
    # is absent.
    db_url: str = "postgresql://localhost:5432/discovery"
    db_user: str = "discovery"
    db_password: str = "discovery"

    # Mirror of Hikari maximum-pool-size / minimum-idle. A managed Postgres has
    # a far lower connection ceiling than a dedicated one, and Railway runs
    # WEB_CONCURRENCY worker processes that each hold a pool, so the effective
    # total is db_pool_size x workers — keep this modest in production.
    db_pool_size: int = 20
    db_pool_min_idle: int = 5
    # Recycle connections before a managed proxy silently drops them.
    db_pool_recycle_seconds: int = 1800
    # Appended to the connection URL when set (e.g. "require" to force TLS).
    # Left empty, psycopg negotiates TLS and falls back — right for both the
    # plaintext compose network and Railway's TLS-terminating proxy.
    db_sslmode: str = ""

    jwt_secret: str = "change-me-in-production-please-32-bytes-minimum!"
    jwt_ttl_minutes: int = 60

    # Comma-separated exact origins allowed to call this API with credentials.
    # Production: add the Vercel domain, e.g.
    #   ALLOWED_ORIGINS=http://localhost:3000,https://jsan-finder.vercel.app
    allowed_origins: str = "http://localhost:3000"
    # Vercel mints a unique hostname per preview deployment, so they cannot be
    # enumerated. Set ALLOWED_ORIGIN_REGEX to admit them, e.g.
    #   ^https://jsan-finder-[a-z0-9-]+\\.vercel\\.app$
    allowed_origin_regex: str = ""

    # Railway injects this on every service it runs; it is the marker used to
    # keep the in-process APScheduler off in production (see scheduler_active).
    railway_environment: str = ""

    # Tri-state: None = decide automatically, True/False = explicit override.
    scheduler_enabled: bool | None = None

    @property
    def sqlalchemy_url(self) -> str:
        """Normalize the configured URL into a SQLAlchemy/psycopg URL."""
        url = self.database_url or self.db_url
        if url.startswith("jdbc:"):
            url = url[len("jdbc:"):]
        # Railway/Heroku hand out the legacy `postgres://` scheme, which
        # SQLAlchemy 2.x no longer registers.
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if url.startswith("postgresql://") and "@" not in url:
            # Inject credentials supplied separately (DB_USER / DB_PASSWORD),
            # URL-encoding them so special characters (@ : / #) survive.
            from urllib.parse import quote

            creds = f"{quote(self.db_user, safe='')}:{quote(self.db_password, safe='')}"
            url = url.replace("postgresql://", f"postgresql://{creds}@", 1)
        if self.db_sslmode and "sslmode=" not in url:
            url = f"{url}{'&' if '?' in url else '?'}sslmode={self.db_sslmode}"
        return url.replace("postgresql://", "postgresql+psycopg://", 1)

    @property
    def cors_origins(self) -> list[str]:
        """Exact allowed origins, trimmed and de-duplicated in order."""
        seen: dict[str, None] = {}
        for origin in self.allowed_origins.split(","):
            cleaned = origin.strip().rstrip("/")
            if cleaned:
                seen.setdefault(cleaned, None)
        return list(seen)

    @property
    def scheduler_active(self) -> bool:
        """
        Whether this process runs the in-process data-collection scheduler.

        Ingestion for the deployed portal is owned by Vercel Cron
        (GET /api/cron/ingest, see vercel.json), so a Railway instance must not
        collect in parallel — that would double-write the same sources. The
        default is therefore "on everywhere except Railway", which preserves the
        docker-compose behaviour exactly while making duplicate cron impossible
        in production without anyone remembering to set a flag.

        SCHEDULER_ENABLED=true|false overrides the detection either way.
        """
        if self.scheduler_enabled is not None:
            return self.scheduler_enabled
        return not self.railway_environment


@lru_cache
def get_settings() -> Settings:
    return Settings()
