# ---- Backend (FastAPI / Python) production image -----------------------
# One image serves both targets:
#   • docker-compose — no PORT/WEB_CONCURRENCY set, so it stays a single
#     process on 8080, exactly as before.
#   • Railway        — injects PORT (and optionally WEB_CONCURRENCY); the
#     start command in railway.json takes over from the CMD below.
FROM python:3.13-slim AS runtime
WORKDIR /app

# Unbuffered stdout so Railway's log drain shows output as it happens rather
# than in blocks when the pipe fills; no .pyc files in a read-only container.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as a non-root user (parity with the previous image)
RUN addgroup --system discovery && adduser --system --ingroup discovery discovery
USER discovery

# Raw API captures (provenance evidence) — writable for the non-root user
ENV CONNECTOR_CAPTURE_DIR=/tmp/captures

EXPOSE 8080
# Shell form so ${PORT} expands: Railway (and most PaaS) assign the port at
# runtime and route to it, while docker-compose sets no PORT and keeps 8080 —
# the port the frontend's API_BASE and the compose port mapping both expect.
#
# --proxy-headers + --forwarded-allow-ips: behind Railway's edge every request
# arrives from the proxy, so X-Forwarded-Proto/For must be trusted or every
# request_url the app builds comes out as http:// on an https:// deployment.
#
# WEB_CONCURRENCY defaults to 1 here on purpose: with the scheduler active
# (compose, local) each worker process would start its own APScheduler and run
# every collection job twice. Railway disables the scheduler and raises this.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers ${WEB_CONCURRENCY:-1} --proxy-headers --forwarded-allow-ips='*'"]
