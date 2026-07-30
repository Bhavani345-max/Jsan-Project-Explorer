// ------------------------------------------------------------------
// Neon Postgres data-access layer (server-only).
//
// Persists ingested opportunities so the deployed portal accumulates real,
// day-by-day data. Lazily initialized so `next build` never crashes when
// DATABASE_URL is absent, and every read degrades gracefully (callers fall
// back to the in-memory seed when the DB is empty or unreachable).
// ------------------------------------------------------------------
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Project } from "@/lib/types";
import { money } from "@/lib/format";
import { TARGET_SERVICE_LINES, TARGET_MIN_BUDGET_USD } from "@/lib/domain";
import type { NormalizedOpportunity } from "@/lib/ingest/normalize";

let _sql: NeonQueryFunction<false, false> | null = null;

/** Lazy Neon client. Returns null when no connection string is configured. */
export function getSql(): NeonQueryFunction<false, false> | null {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return null;
  _sql = neon(url);
  return _sql;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

const SCHEMA_STATEMENTS = [
`CREATE TABLE IF NOT EXISTS opportunities (
  id                TEXT PRIMARY KEY,
  reference_number  TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  summary           TEXT NOT NULL DEFAULT '',
  organization      TEXT NOT NULL DEFAULT 'Unknown organization',
  country           TEXT NOT NULL DEFAULT 'Unknown',
  state             TEXT NOT NULL DEFAULT '',
  budget_usd        BIGINT,
  currency          TEXT NOT NULL DEFAULT 'USD',
  deadline          DATE,
  publication_date  DATE NOT NULL,
  source            TEXT NOT NULL,
  source_type       TEXT NOT NULL,
  category          TEXT NOT NULL,
  service_line      TEXT NOT NULL,
  fit_score         INTEGER NOT NULL DEFAULT 40,
  project_type      TEXT NOT NULL,
  technologies      TEXT[] NOT NULL DEFAULT '{}',
  tags              TEXT[] NOT NULL DEFAULT '{}',
  eligibility       TEXT NOT NULL DEFAULT '',
  official_link     TEXT NOT NULL DEFAULT '',
  contact_name      TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  industry          TEXT NOT NULL DEFAULT 'Public Sector',
  ai_enriched       BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_country      ON opportunities (country)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_service_line ON opportunities (service_line)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_publication  ON opportunities (publication_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_source       ON opportunities (source)`,
];

/** Create the table + indexes if they don't exist. Safe to call repeatedly. */
export async function ensureSchema(): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  // Neon's HTTP driver runs one statement per query — execute them in sequence.
  for (const stmt of SCHEMA_STATEMENTS) await sql.query(stmt);
}

/**
 * Idempotent upsert keyed on the deterministic id. Re-ingesting the same
 * notice refreshes its mutable fields (status via deadline, budget, summary)
 * without creating duplicates. Returns the number of rows written.
 */
export async function upsertOpportunities(rows: NormalizedOpportunity[]): Promise<number> {
  const sql = getSql();
  if (!sql || rows.length === 0) return 0;

  let written = 0;
  for (const r of rows) {
    await sql.query(
      `INSERT INTO opportunities (
         id, reference_number, title, description, summary, organization, country, state,
         budget_usd, currency, deadline, publication_date, source, source_type, category,
         service_line, fit_score, project_type, technologies, tags, eligibility, official_link,
         contact_name, contact_email, contact_phone, industry
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
       )
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         summary = CASE WHEN opportunities.ai_enriched THEN opportunities.summary ELSE EXCLUDED.summary END,
         budget_usd = EXCLUDED.budget_usd,
         deadline = EXCLUDED.deadline,
         organization = EXCLUDED.organization,
         category = EXCLUDED.category,
         service_line = EXCLUDED.service_line,
         fit_score = EXCLUDED.fit_score,
         technologies = EXCLUDED.technologies,
         tags = EXCLUDED.tags,
         official_link = EXCLUDED.official_link,
         updated_at = now()`,
      [
        r.id, r.referenceNumber, r.title, r.description, r.summary, r.organization, r.country, r.state,
        r.budgetUsd, r.currency, r.deadline, r.publicationDate, r.source, r.sourceType, r.category,
        r.serviceLine, r.fitScore, r.projectType, r.technologies, r.tags, r.eligibility, r.officialLink,
        r.contactName, r.contactEmail, r.contactPhone, r.industry,
      ],
    );
    written++;
  }
  return written;
}

/**
 * Delete opportunities that no longer belong in the portal: a deadline already
 * in the past, (no deadline) published longer ago than the freshness window, or
 * a disclosed budget below the minimum pursuable value. Keeps the portal showing
 * only active, open, worthwhile opportunities. Returns rows removed.
 */
export async function purgeExpired(
  maxAgeDaysNoDeadline = 180,
  minBudgetUsd = TARGET_MIN_BUDGET_USD,
): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  try {
    const rows = (await sql.query(
      `DELETE FROM opportunities
        WHERE (deadline IS NOT NULL AND deadline < CURRENT_DATE)
           OR (deadline IS NULL AND publication_date < CURRENT_DATE - make_interval(days => $1::int))
           OR (budget_usd IS NOT NULL AND budget_usd < $2::bigint)
      RETURNING id`,
      [maxAgeDaysNoDeadline, minBudgetUsd],
    )) as { id: string }[];
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/** Every row held, in-domain or not. Used for ingest reporting. */
export async function countOpportunities(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  try {
    const rows = (await sql.query(`SELECT COUNT(*)::int AS n FROM opportunities`)) as { n: number }[];
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Rows the portal actually surfaces — geospatial and telecom only. */
export async function countInDomain(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  try {
    const rows = (await sql.query(
      `SELECT COUNT(*)::int AS n FROM opportunities WHERE service_line = ANY($1)`,
      [TARGET_SERVICE_LINES],
    )) as { n: number }[];
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

// ---- read mapping --------------------------------------------------
interface Row {
  id: string;
  reference_number: string;
  title: string;
  description: string;
  summary: string;
  organization: string;
  country: string;
  state: string;
  budget_usd: number | null;
  currency: string;
  deadline: string | null;
  publication_date: string;
  source: string;
  source_type: string;
  category: string;
  service_line: string;
  fit_score: number;
  project_type: string;
  technologies: string[];
  tags: string[];
  eligibility: string;
  official_link: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  industry: string;
}

const DAY = 86_400_000;

// Neon returns DATE columns as JS Date objects built at local midnight. Format
// them from local calendar components so the ISO date is correct regardless of
// server timezone (IST locally, UTC on Vercel) — toISOString() would shift the
// day. Also tolerates plain strings.
function toIsoDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : toIsoDate(d);
}

function statusFor(deadlineIso: string): Project["status"] {
  if (!deadlineIso) return "Open";
  const days = Math.ceil((new Date(`${deadlineIso}T00:00:00Z`).getTime() - Date.now()) / DAY);
  if (days < 0) return "Closed";
  if (days <= 7) return "Closing Soon";
  return "Open";
}

function toProject(r: Row): Project {
  const deadlineIso = toIsoDate(r.deadline);
  // Neon returns BIGINT as a string (64-bit safety) — coerce to a real number.
  // Undisclosed budgets default to $1M so every opportunity carries a value
  // (disclosed budgets are already filtered to ≥ $1M at ingest).
  const budget = r.budget_usd == null ? TARGET_MIN_BUDGET_USD : Number(r.budget_usd);
  const contact =
    r.contact_name || r.contact_email || r.contact_phone
      ? { name: r.contact_name ?? undefined, email: r.contact_email ?? undefined, phone: r.contact_phone ?? undefined }
      : null;
  return {
    id: r.id,
    referenceNumber: r.reference_number,
    title: r.title,
    description: r.description,
    summary: r.summary || (r.description ? `${r.description.slice(0, 220)}…` : r.title),
    organization: r.organization,
    country: r.country,
    state: r.state,
    budget,
    budgetLabel: money(budget),
    currency: r.currency,
    deadline: deadlineIso,
    publicationDate: toIsoDate(r.publication_date),
    source: r.source,
    sourceType: r.source_type as Project["sourceType"],
    category: r.category as Project["category"],
    serviceLine: r.service_line as Project["serviceLine"],
    fitScore: r.fit_score,
    projectType: r.project_type as Project["projectType"],
    status: statusFor(deadlineIso),
    technologies: r.technologies ?? [],
    tags: r.tags ?? [],
    eligibility: r.eligibility,
    officialLink: r.official_link,
    contact,
    industry: r.industry,
  };
}

/**
 * Load in-domain opportunities as Project objects (capped for safety).
 *
 * The service-line filter runs in SQL — not after loading — so the limit
 * applies to rows the portal will actually show. Out-of-domain records stay
 * in the table untouched; they are simply not selected.
 *
 * Returns null when the DB is unconfigured, empty, or unreachable so callers
 * can fall back to the seed dataset.
 */
export async function loadLiveProjects(limit = 4000): Promise<Project[] | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = (await sql.query(
      `SELECT * FROM opportunities
        WHERE service_line = ANY($1)
        ORDER BY publication_date DESC, ingested_at DESC
        LIMIT $2`,
      [TARGET_SERVICE_LINES, limit],
    )) as Row[];
    if (!rows.length) return null;
    return rows.map(toProject);
  } catch {
    return null;
  }
}
