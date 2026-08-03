"""
Application settings — every value is overridable via environment variables,
using the SAME variable names as the previous Spring Boot service so
docker-compose and CI pipelines keep working unchanged:

    DB_URL, DB_USER, DB_PASSWORD, REDIS_HOST, REDIS_PORT, JWT_SECRET
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)

    app_name: str = "JSAN_NexusAI_Enterprise_Growth_Platform"

    # Accepts either a JDBC-style URL (jdbc:postgresql://host:5432/db — what
    # docker-compose passes) or a plain SQLAlchemy URL.
    db_url: str = "postgresql://localhost:5432/discovery"
    db_user: str = "discovery"
    db_password: str = "discovery"

    # Mirror of Hikari maximum-pool-size / minimum-idle
    db_pool_size: int = 20
    db_pool_min_idle: int = 5

    redis_host: str = "localhost"
    redis_port: int = 6379

    jwt_secret: str = "change-me-in-production-please-32-bytes-minimum!"
    jwt_ttl_minutes: int = 60

    allowed_origins: str = "http://localhost:3000"

    @property
    def sqlalchemy_url(self) -> str:
        """Normalize the configured URL into a SQLAlchemy/psycopg URL."""
        url = self.db_url
        if url.startswith("jdbc:"):
            url = url[len("jdbc:"):]
        if url.startswith("postgresql://") and "@" not in url:
            # Inject credentials supplied separately (DB_USER / DB_PASSWORD),
            # URL-encoding them so special characters (@ : / #) survive.
            from urllib.parse import quote

            creds = f"{quote(self.db_user, safe='')}:{quote(self.db_password, safe='')}"
            url = url.replace("postgresql://", f"postgresql://{creds}@", 1)
        return url.replace("postgresql://", "postgresql+psycopg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
