// ------------------------------------------------------------------
// Postgres data-access layer (server-only).
//
// Persists ingested opportunities so the deployed portal accumulates real,
// day-by-day data. Lazily initialized so `next build` never crashes when
// DATABASE_URL is absent, and every read degrades gracefully (callers fall
// back to the in-memory seed when the DB is empty or unreachable).
//
// Host-agnostic by design: the connection string alone decides how we talk to
// Postgres. Neon endpoints keep using Neon's HTTP driver (no TCP handshake per
// serverless invocation, which is what makes it fast on Vercel); any other
// host — Railway Postgres in production, the docker-compose Postgres locally —
// uses node-postgres over TCP. Both are exposed through the SAME tiny
// `SqlClient.query(text, params) -> rows` contract, so every query, cast and
// mapping below is identical on either driver and no caller changes.
// ------------------------------------------------------------------
import { neon } from "@neondatabase/serverless";
import { Pool, type PoolConfig } from "pg";
import type { Project } from "@/lib/types";
import { money } from "@/lib/format";
import {
  TARGET_SERVICE_LINES,
  MIN_BUDGET_USD,
  PRIMARY_BUDGET_USD,
  RETENTION_MIN_BUDGET_USD,
  UNDISCLOSED_BUDGET_USD,
} from "@/lib/domain";
import type { NormalizedOpportunity } from "@/lib/ingest/normalize";
import { isOutOfScope } from "@/lib/ingest/scope";
import { fitScoreFor } from "@/lib/scoring";

/**
 * The only surface callers use. Deliberately narrow: `sql.query(text, params)`
 * resolving to a plain array of rows is exactly what the Neon HTTP driver
 * already returned, so existing call sites are untouched.
 */
export interface SqlClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, params?: unknown[]): Promise<Record<string, any>[]>;
}

let _sql: SqlClient | null = null;

/** The configured connection string, whichever variable carries it. */
function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/**
 * Neon for Neon-hosted URLs, node-postgres for everything else.
 * `DB_DRIVER=neon|pg` forces the choice when auto-detection is wrong (e.g. a
 * Neon connection routed through a custom hostname).
 */
function driverFor(url: string): "neon" | "pg" {
  const forced = process.env.DB_DRIVER?.trim().toLowerCase();
  if (forced === "neon" || forced === "pg") return forced;
  return /\.neon\.tech|\.neon\.build/i.test(url) ? "neon" : "pg";
}

/**
 * TLS policy for the TCP driver.
 *
 * Managed providers terminate TLS at a proxy whose certificate does not chain
 * to a public root (Railway's `*.proxy.rlwy.net` is one), so verification is
 * off by default or the connection simply fails. Set
 * DB_SSL_REJECT_UNAUTHORIZED=true once you supply a trusted root via
 * PGSSLROOTCERT to get full verification.
 */
function sslFor(url: string): PoolConfig["ssl"] {
  if (/[?&]sslmode=disable/i.test(url)) return undefined;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  // Loopback and Railway's private network are unencrypted by design.
  const plaintext =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "postgres" || // docker-compose service name
    host.endsWith(".railway.internal");
  if (plaintext) return undefined;
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
}

/**
 * The URL handed to node-postgres, with `sslmode` removed.
 *
 * TLS is decided by sslFor() above and passed as the explicit `ssl` option.
 * Leaving sslmode in the string as well makes pg emit a deprecation warning on
 * every boot — it is changing sslmode=require to mean full verification in its
 * next major — and would silently change behaviour when that lands. Dropping
 * the parameter keeps exactly one source of truth.
 */
function pgConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Lazy client. Returns null when no connection string is configured. */
export function getSql(): SqlClient | null {
  if (_sql) return _sql;
  const url = connectionString();
  if (!url) return null;

  if (driverFor(url) === "neon") {
    const client = neon(url);
    _sql = { query: (text, params) => client.query(text, params as unknown[]) };
    return _sql;
  }

  // Small pool on purpose: on Vercel every warm function instance holds its
  // own, so a large `max` multiplied by instance count exhausts a managed
  // database's connection limit. Raise DB_POOL_MAX only on long-lived hosts.
  const pool = new Pool({
    connectionString: pgConnectionString(url),
    max: Number(process.env.DB_POOL_MAX ?? 2),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: sslFor(url),
  });
  // A network-level error on an idle pooled client is emitted on the pool; pg
  // treats an unhandled 'error' as fatal to the process. Swallow it — the next
  // query transparently opens a fresh connection, and every read here already
  // degrades to the seed.
  pool.on("error", () => {});
  _sql = { query: async (text, params) => (await pool.query(text, params)).rows };
  return _sql;
}

export function dbConfigured(): boolean {
  return Boolean(connectionString());
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
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_country      ON opportunities (country)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_service_line ON opportunities (service_line)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_publication  ON opportunities (publication_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_opp_source       ON opportunities (source)`,
  // Drives the "new opportunities" feed, which orders by first-seen rather than
  // publication date. Without it that read is a full sort of the table on every
  // poll; the feed only ever wants the newest handful.
  `CREATE INDEX IF NOT EXISTS idx_opp_ingested     ON opportunities (ingested_at DESC)`,
  // English rendering of the notice title, derived from the English CPV label
  // TED already publishes ("Country - English CPV label - native title"). 93% of
  // stored notices are non-English, so this is what the portal displays and
  // searches on. The
  // original is never overwritten — it stays in `title` for provenance, since
  // these are official notices that must remain citable.
  //
  // Added with ALTER rather than in CREATE TABLE: ensureSchema runs against
  // databases that already hold data, and CREATE TABLE IF NOT EXISTS is a no-op
  // there, so a new column would never appear.
  `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS title_en TEXT`,
  `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS translated BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE INDEX IF NOT EXISTS idx_opp_translated   ON opportunities (translated)`,
  // Dropped with the AI enrichment layer: it marked rows whose summary had been
  // rewritten by a model so re-ingest would not clobber it. Every summary now
  // comes from the notice itself, so there is nothing to protect.
  `ALTER TABLE opportunities DROP COLUMN IF EXISTS ai_enriched`,
];

/** Create the table + indexes if they don't exist. Safe to call repeatedly. */
export async function ensureSchema(): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  // Neon's HTTP driver runs one statement per query, so DDL cannot be sent as a
  // single script — execute the statements in sequence (also fine on pg).
  for (const stmt of SCHEMA_STATEMENTS) await sql.query(stmt);
}

const UPSERT_COLUMNS = 26;
// Rows per INSERT. Neon's HTTP driver costs a full round-trip per statement, so
// writing one row at a time made ingest scale linearly in network latency —
// fine at 100 rows, too slow at 1,000 against the cron's 300s budget. At 40 rows
// this is 40x fewer round-trips and still only ~1,040 bind parameters, far under
// Postgres's 65,535 limit.
const UPSERT_BATCH = 40;

/**
 * Idempotent upsert keyed on the deterministic id, in batches. Re-ingesting the
 * same notice refreshes its mutable fields (status via deadline, budget,
 * summary) without creating duplicates. Returns the number of rows written.
 */
export async function upsertOpportunities(rows: NormalizedOpportunity[]): Promise<number> {
  const sql = getSql();
  if (!sql || rows.length === 0) return 0;

  // A duplicate id inside a single multi-row INSERT is a hard Postgres error
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), which
  // would abort the whole batch. The pipeline already dedupes upstream; this is
  // insurance so one repeated notice can never fail an entire ingest run.
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];

  let written = 0;
  for (let start = 0; start < unique.length; start += UPSERT_BATCH) {
    const batch = unique.slice(start, start + UPSERT_BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((r, n) => {
      params.push(
        r.id, r.referenceNumber, r.title, r.description, r.summary, r.organization, r.country, r.state,
        r.budgetUsd, r.currency, r.deadline, r.publicationDate, r.source, r.sourceType, r.category,
        r.serviceLine, r.fitScore, r.projectType, r.technologies, r.tags, r.eligibility, r.officialLink,
        r.contactName, r.contactEmail, r.contactPhone, r.industry,
      );
      const base = n * UPSERT_COLUMNS;
      return `(${Array.from({ length: UPSERT_COLUMNS }, (_, k) => `$${base + k + 1}`).join(",")})`;
    });

    await sql.query(
      `INSERT INTO opportunities (
         id, reference_number, title, description, summary, organization, country, state,
         budget_usd, currency, deadline, publication_date, source, source_type, category,
         service_line, fit_score, project_type, technologies, tags, eligibility, official_link,
         contact_name, contact_email, contact_phone, industry
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         summary = EXCLUDED.summary,
         budget_usd = EXCLUDED.budget_usd,
         deadline = EXCLUDED.deadline,
         organization = EXCLUDED.organization,
         category = EXCLUDED.category,
         service_line = EXCLUDED.service_line,
         fit_score = EXCLUDED.fit_score,
         technologies = EXCLUDED.technologies,
         tags = EXCLUDED.tags,
         official_link = EXCLUDED.official_link,
         -- A changed title invalidates the English rendering derived from it.
         -- Without this the row keeps a title_en built from wording the source
         -- has since replaced, and because the read layer PREFERS title_en the
         -- board would go on displaying the old title indefinitely — as would
         -- /api/cron/reclassify, which classifies on title_en where it exists.
         -- Nulling it and clearing the flag hands the row back to
         -- translatePending, which refills it on this run or the next.
         title_en = CASE WHEN opportunities.title IS DISTINCT FROM EXCLUDED.title
                         THEN NULL ELSE opportunities.title_en END,
         translated = CASE WHEN opportunities.title IS DISTINCT FROM EXCLUDED.title
                           THEN FALSE ELSE opportunities.translated END,
         updated_at = now()`,
      params,
    );
    written += batch.length;
  }
  return written;
}

/**
 * Delete opportunities that are genuinely spent: a deadline already in the past,
 * (no deadline) published longer ago than the freshness window, or a disclosed
 * value so small it is not worth the row. Returns rows removed.
 *
 * The budget clause uses the RETENTION floor, NOT the collection floor — see
 * lib/domain.ts. A notice below the collection floor is already invisible
 * (loadLiveProjects filters it in SQL), so deleting it gains nothing and would
 * make raising that floor an irreversible act.
 */
export async function purgeExpired(
  maxAgeDaysNoDeadline = 180,
  minBudgetUsd = RETENTION_MIN_BUDGET_USD,
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

/** Rows the portal actually surfaces — in-domain, and clearing the value floor
 *  on the same terms as the read query, so this cannot over-report the board. */
export async function countInDomain(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  try {
    const rows = (await sql.query(
      `SELECT COUNT(*)::int AS n FROM opportunities
        WHERE service_line = ANY($1)
          AND (budget_usd IS NULL OR budget_usd >= $2::bigint)`,
      [TARGET_SERVICE_LINES, MIN_BUDGET_USD],
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
  title_en: string | null;
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
  ingested_at: string | Date | null;
}

const DAY = 86_400_000;

// Both drivers return DATE columns as JS Date objects built at local midnight.
// Format them from local calendar components so the ISO date is correct
// regardless of server timezone (IST locally, UTC on Vercel/Railway) —
// toISOString() would shift the day. Also tolerates plain strings.
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

/**
 * TIMESTAMPTZ → ISO-8601 with the zone intact.
 *
 * Deliberately NOT toIsoDate's local-calendar treatment: that exists because a
 * DATE column carries no time and both drivers materialise it at *local*
 * midnight, so reading UTC components would shift the day. A TIMESTAMPTZ is a
 * real instant, so toISOString() is exactly right — and the feed needs the time
 * of day to say "3h ago" rather than just "today".
 */
function toIsoTimestamp(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
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
  // Both drivers return BIGINT as a string (64-bit safety) — coerce to a number.
  // A notice that disclosed nothing carries the stand-in value so every record
  // has something to format — presented at the primary line, never as a token
  // figure. See UNDISCLOSED_BUDGET_USD in lib/domain.ts for what that implies
  // for the tier split. Disclosed values are already held to the collection
  // floor at ingest and in the read query below.
  const budgetDisclosed = r.budget_usd != null;
  const budget = budgetDisclosed ? Number(r.budget_usd) : UNDISCLOSED_BUDGET_USD;
  const contact =
    r.contact_name || r.contact_email || r.contact_phone
      ? { name: r.contact_name ?? undefined, email: r.contact_email ?? undefined, phone: r.contact_phone ?? undefined }
      : null;
  // Present the English title everywhere. Because this is resolved once here,
  // every consumer downstream — cards, search, facets, the assistant's grounding
  // context, PDF/PPTX export — gets English for free, with no per-call handling.
  const englishTitle = r.title_en?.trim() || r.title;

  // TED search returns metadata only, so description === title and the heuristic
  // summary is just that title repeated. When such a summary is still the
  // untranslated original, show the English title instead. An AI-written summary
  // is already English and is left alone.
  const summary =
    r.summary && r.summary !== r.title
      ? r.summary
      : englishTitle;

  return {
    id: r.id,
    referenceNumber: r.reference_number,
    title: englishTitle,
    originalTitle: r.title,
    description: r.description,
    summary,
    organization: r.organization,
    country: r.country,
    state: r.state,
    budget,
    budgetDisclosed,
    // Says "Undisclosed" when the buyer published nothing, which is what the
    // seed's factory has always done. This used to format the stand-in, so the
    // details page of a notice with no published value stated "$15.0M" as
    // plainly as one that really is worth that — the reader had no way to tell
    // the two apart. The stand-in stays in `budget` for sorting and banding;
    // it just no longer gets quoted back as though a buyer had committed to it.
    budgetLabel: budgetDisclosed ? money(budget) : "Undisclosed",
    currency: r.currency,
    deadline: deadlineIso,
    publicationDate: toIsoDate(r.publication_date),
    ingestedAt: toIsoTimestamp(r.ingested_at) || undefined,
    source: r.source,
    sourceType: r.source_type as Project["sourceType"],
    category: r.category as Project["category"],
    serviceLine: r.service_line as Project["serviceLine"],
    // Scored from the rules here rather than served from the stored column.
    //
    // fit_score is a denormalization written at ingest and refreshed by
    // /api/cron/reclassify, so after any change to the rule table it is stale
    // for every row until that job runs — which would have shipped a
    // "Recommended 70+" filter that returned nothing until someone remembered
    // to trigger a backfill. Deriving it on read makes lib/scoring.ts the only
    // source of truth and removes that failure mode; the column stays, and the
    // two agree once the job has run.
    fitScore: fitScoreFor({
      title: englishTitle,
      description: r.description,
      budgetUsd: r.budget_usd == null ? null : Number(r.budget_usd),
      country: r.country,
      deadline: deadlineIso || null,
      serviceLine: r.service_line,
    }),
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
          AND (budget_usd IS NULL OR budget_usd >= $2::bigint)
        ORDER BY publication_date DESC, ingested_at DESC
        LIMIT $3`,
      [TARGET_SERVICE_LINES, MIN_BUDGET_USD, limit],
    )) as Row[];
    if (!rows.length) return null;
    // Read-side scope gate. Rows stored before the goods rule existed — about a
    // quarter of the table — are hidden here rather than deleted, exactly as
    // the out-of-domain filter works. They come back into view by widening the
    // rule, and /api/cron/reclassify rescores them to 0 so they also sink out
    // of every ranking. Applied after mapping because it reads the English
    // title, which is where the procurement category appears.
    const visible = rows.map(toProject).filter((p) => !isOutOfScope(p.title));
    return visible.length ? visible : null;
  } catch {
    return null;
  }
}

/**
 * The most recently ingested in-domain opportunities — what the portal shows as
 * "new". Ordered by `ingested_at`, NOT `publication_date`: a notice a buyer
 * published last week but that reached us in this morning's run is new to the
 * reader, and ordering by publication date would bury it. The upsert never
 * touches ingested_at on conflict, so re-ingesting a notice cannot make it
 * resurface as new.
 *
 * Deliberately its own query rather than a re-sort of loadLiveProjects(): that
 * caps at 4,000 rows ordered by publication date, so a freshly ingested notice
 * with an older publication date could fall outside the cap and never appear
 * here at all.
 *
 * Returns null when the DB is unconfigured, empty or unreachable, so the caller
 * can fall back to the seed exactly as every other read does.
 */
export async function loadRecentOpportunities(limit = 20): Promise<Project[] | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    // Over-fetch: the goods/out-of-scope gate below runs on the mapped English
    // title and historically removes about a quarter of stored rows, so taking
    // exactly `limit` from SQL would hand back a short feed.
    const rows = (await sql.query(
      // The board contract-value policy is applied in SQL on this path, not
      // after mapping: the rows are sliced to `limit` below, so a post-slice
      // filter would hand back a near-empty feed. NOT NULL is what enforces
      // "disclosed" — an undisclosed notice stores NULL and only acquires the
      // stand-in when toProject maps it, which is after this query runs.
      `SELECT * FROM opportunities
        WHERE service_line = ANY($1)
          AND budget_usd IS NOT NULL
          AND budget_usd >= $2::bigint
        ORDER BY ingested_at DESC
        LIMIT $3`,
      [TARGET_SERVICE_LINES, PRIMARY_BUDGET_USD, Math.min(limit * 4, 400)],
    )) as Row[];
    if (!rows.length) return null;
    const visible = rows
      .map(toProject)
      .filter((p) => !isOutOfScope(p.title))
      .slice(0, limit);
    return visible.length ? visible : null;
  } catch {
    return null;
  }
}
