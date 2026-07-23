"""
Centralized exception handling returning RFC-7807 Problem Details —
identical response shape to the previous GlobalExceptionHandler.
"""
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse


class ResourceNotFoundException(Exception):
    def __init__(self, entity: str, resource_id: str):
        super().__init__(f"{entity} not found: {resource_id}")


def _problem(status: int, title: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": title,
            "status": status,
            "detail": detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ResourceNotFoundException)
    async def handle_not_found(request: Request, exc: ResourceNotFoundException):
        return _problem(404, "Resource not found", str(exc))

    @app.exception_handler(ValueError)
    async def handle_bad_request(request: Request, exc: ValueError):
        return _problem(400, "Invalid request", str(exc))

    @app.exception_handler(HTTPException)
    async def handle_http(request: Request, exc: HTTPException):
        response = _problem(exc.status_code, exc.detail, exc.detail)
        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(Exception)
    async def handle_generic(request: Request, exc: Exception):
        return _problem(500, "Internal error", "An unexpected error occurred")
