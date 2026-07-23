"""
Connector framework contract. Each public source (SAM.gov, TED Europa, an
RSS feed, a JSON endpoint) provides an implementation and registers it in
`CONNECTORS`. New sources are added without touching the scheduler —
Open/Closed principle.

Implementations are responsible for: authentication (API Key / OAuth /
Bearer), pagination, rate limiting and retry. They MUST only call
publicly-accessible endpoints and respect robots/ToS — no scraping of sites
that prohibit automation.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from app.models import Project


@dataclass(frozen=True)
class ConnectorContext:
    """Runtime context handed to a connector for one collection cycle.

    base_url:           endpoint to call
    auth_type:          None | ApiKey | OAuth | Bearer
    auth_secret_ref:    pointer resolved against the secrets manager
    since:              watermark — only fetch items newer than this
    rate_limit_per_min: request budget the connector must stay within
    pagination:         Offset | Cursor | Page | None
    """

    base_url: str | None
    auth_type: str
    auth_secret_ref: str | None
    since: datetime
    rate_limit_per_min: int
    pagination: str


class SourceConnector(ABC):
    @abstractmethod
    def key(self) -> str:
        """Stable identifier, e.g. 'sam-gov'."""

    @abstractmethod
    def supports(self, source_type: str) -> bool:
        """Whether this connector can serve the given source type."""

    @abstractmethod
    def fetch(self, context: ConnectorContext) -> list[Project]:
        """Fetch and normalize opportunities published since the watermark."""


# Registry of active connector implementations (populated as sources are added).
CONNECTORS: list[SourceConnector] = []
