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
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
