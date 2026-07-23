"""
API interceptor — a transparent capture layer for every outbound connector
HTTP call, built on httpx event hooks.

Purpose: provenance. Every request/response that flows through a connector is
recorded — method, URL, status, latency, byte size, and a SHA-256 of the raw
body — and the raw payload is written to a capture directory. This makes the
ingestion pipeline auditable: any project row in the database can be traced
back to the exact raw API response it came from, proving the data was fetched,
not fabricated.

Usage:
    interceptor = ApiInterceptor()
    with httpx.Client(event_hooks=interceptor.event_hooks()) as client:
        ...
    interceptor.summary()   # -> list of CaptureRecord
"""
import hashlib
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field

import httpx

log = logging.getLogger("discovery.interceptor")

# Raw payloads land here; override with CONNECTOR_CAPTURE_DIR. Empty string
# disables disk capture (metadata is still recorded in memory).
_DEFAULT_DIR = os.environ.get("CONNECTOR_CAPTURE_DIR", "captures")


@dataclass
class CaptureRecord:
    seq: int
    method: str
    url: str
    status: int | None = None
    duration_ms: int | None = None
    response_bytes: int | None = None
    body_sha256: str | None = None
    capture_file: str | None = None
    error: str | None = None


@dataclass
class ApiInterceptor:
    capture_dir: str = _DEFAULT_DIR
    records: list[CaptureRecord] = field(default_factory=list)
    _seq: int = 0

    def event_hooks(self) -> dict:
        return {"request": [self._on_request], "response": [self._on_response]}

    # ---- hooks -----------------------------------------------------------
    def _on_request(self, request: httpx.Request) -> None:
        self._seq += 1
        request.extensions["capture"] = CaptureRecord(
            seq=self._seq, method=request.method, url=str(request.url)
        )
        request.extensions["capture_start"] = time.monotonic()
        log.info("[intercept #%d] -> %s %s", self._seq, request.method, request.url)

    def _on_response(self, response: httpx.Response) -> None:
        record: CaptureRecord = response.request.extensions.get("capture")
        if record is None:  # not one of ours
            return
        start = response.request.extensions.get("capture_start")
        response.read()  # ensure the body is available for hashing/saving
        body = response.content or b""

        record.status = response.status_code
        record.duration_ms = int((time.monotonic() - start) * 1000) if start else None
        record.response_bytes = len(body)
        record.body_sha256 = hashlib.sha256(body).hexdigest()
        record.capture_file = self._save(record, body)
        self.records.append(record)
        log.info("[intercept #%d] <- %s %dB in %sms sha256=%s",
                 record.seq, record.status, record.response_bytes,
                 record.duration_ms, record.body_sha256[:12])

    # ---- capture-to-disk -------------------------------------------------
    def _save(self, record: CaptureRecord, body: bytes) -> str | None:
        if not self.capture_dir:
            return None
        try:
            os.makedirs(self.capture_dir, exist_ok=True)
            name = f"capture_{time.strftime('%Y%m%dT%H%M%S')}_{record.seq:03d}_{record.status}.json"
            path = os.path.join(self.capture_dir, name)
            envelope = {
                "meta": asdict(record) | {"capture_file": name},
                "raw_body": body.decode("utf-8", errors="replace"),
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(envelope, f, ensure_ascii=False, indent=1)
            return name
        except OSError as ex:
            log.warning("Capture write failed (non-fatal): %s", ex)
            return None

    # ---- reporting -------------------------------------------------------
    def summary(self) -> list[dict]:
        return [asdict(r) for r in self.records]

    def total_bytes(self) -> int:
        return sum(r.response_bytes or 0 for r in self.records)
