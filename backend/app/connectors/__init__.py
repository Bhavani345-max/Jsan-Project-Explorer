"""Connector registry — importing this package registers all live connectors."""
from app.connectors.base import CONNECTORS, ConnectorContext, SourceConnector
from app.connectors.contracts_finder import ContractsFinderConnector

# Register live connectors (Open/Closed: add new sources here, nothing else changes)
if not any(c.key() == "uk-contracts-finder" for c in CONNECTORS):
    CONNECTORS.append(ContractsFinderConnector())

__all__ = ["CONNECTORS", "ConnectorContext", "SourceConnector",
           "ContractsFinderConnector"]
