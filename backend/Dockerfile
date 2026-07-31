# ---- Backend (FastAPI / Python) production image -----------------------
FROM python:3.13-slim AS runtime
WORKDIR /app

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
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
