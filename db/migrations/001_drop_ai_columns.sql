-- ------------------------------------------------------------------
-- 001 — Drop AI naming from the schema.
--
-- The columns held model output when the portal enriched notices through an
-- LLM. That layer is gone: `summary` is now the notice's own wording trimmed
-- to length, `fit_score` is the rule table in src/lib/scoring.ts, and
-- `service_line` is a fixed category mapping. The data is the same shape, so
-- this renames rather than drops — no row loses a value.
--
-- Idempotent: safe to apply to a database that has already been migrated, and
-- safe to apply twice. Run inside one transaction so a failure leaves the
-- schema exactly as it was.
--
--   psql "$DATABASE_URL" -f db/migrations/001_drop_ai_columns.sql
-- ------------------------------------------------------------------
BEGIN;

-- ---------- projects (FastAPI / docker-compose schema) --------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ai_summary')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'projects' AND column_name = 'summary') THEN
        ALTER TABLE projects RENAME COLUMN ai_summary TO summary;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ai_fit_score')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'projects' AND column_name = 'fit_score') THEN
        ALTER TABLE projects RENAME COLUMN ai_fit_score TO fit_score;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'ai_service_line')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'projects' AND column_name = 'service_line') THEN
        ALTER TABLE projects RENAME COLUMN ai_service_line TO service_line;
    END IF;
END $$;

ALTER INDEX IF EXISTS idx_projects_ai_fit RENAME TO idx_projects_fit;

-- ---------- opportunities (Neon / Next.js schema) -------------------
-- `ai_enriched` marked rows whose summary had been rewritten by a model, and
-- guarded them from being overwritten on re-ingest. With no model in the
-- pipeline every summary now comes from the notice, so the flag has no
-- meaning and the upsert no longer reads it.
ALTER TABLE IF EXISTS opportunities DROP COLUMN IF EXISTS ai_enriched;

COMMIT;

-- ------------------------------------------------------------------
-- AFTER MIGRATING: stored fit_score values were produced by the previous
-- formula and are stale. Recompute them across the whole table with
--
--   curl -X POST "https://<host>/api/cron/reclassify?key=$CRON_SECRET"
--
-- which rescores every row in place (UPDATE only, nothing is deleted) and
-- returns a histogram of the new distribution.
-- ------------------------------------------------------------------
