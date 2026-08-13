// ------------------------------------------------------------------
// English titles for ingested notices — derived, not translated.
//
// 93% of stored notices are not in English. TED renders every title as
//   "Country – <English CPV label> – <native title>"
// and that middle segment is an ENGLISH label the publisher already supplies,
// straight out of the EU's Common Procurement Vocabulary. The English text we
// need is therefore present in the source data; it never had to be generated.
//
// This module extracts it. It replaces an earlier version that sent titles to
// an LLM for translation — which cost money, gave a different answer on
// different days, and could not be explained to anyone who asked why a title
// read the way it did.
//
// The original is never overwritten. It stays in `title`; the derived English
// form lands in `title_en`, and the read layer prefers `title_en` while keeping
// the original available for provenance.
//
// Where no English segment exists (a non-TED source publishing in its own
// language), the row keeps `title_en = title` and is marked done: showing the
// publisher's own words is always defensible, and inventing a translation is
// exactly what this rewrite removed.
// ------------------------------------------------------------------
import { getSql } from "@/lib/db";
import { TARGET_SERVICE_LINES } from "@/lib/domain";

interface PendingRow {
  id: string;
  title: string;
  source: string;
}

/**
 * Sources whose titles must be kept exactly as composed, with no CPV fallback.
 *
 * deriveEnglishTitle() collapses a three-segment title to "Country – segment 2"
 * once the tail looks non-English. On TED that is the right answer: segment 2 is
 * the English CPV label, which describes the work. World Bank Tenders has no CPV
 * label, so its connector puts the BUYER there — and the tail test trips on a
 * single non-ASCII character, which an English assignment can easily carry
 * ("Wi‑Fi" with a non-breaking hyphen, "İzci"). Collapsing those would replace
 * the whole assignment with "Sri Lanka – MINISTRY OF IRRIGATION" and lose what
 * the contract is actually for.
 *
 * These titles are already English, so there is nothing to derive: the row keeps
 * its published wording and is marked done.
 */
const TITLE_IS_FINAL = new Set(["World Bank Tenders"]);

/** Split on the en/em dashes TED uses as segment separators. */
function splitTitle(title: string): string[] {
  return title.split(/\s+[–—-]\s+/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Does the title's tail look non-English?
 *
 * Retained from the previous implementation because it still earns its keep:
 * it decides whether the CPV label is worth preferring over the full title.
 * Only the tail is tested — the whole string would flag every TED notice on
 * the strength of its English CPV label.
 */
export function looksNonEnglish(title: string): boolean {
  const parts = splitTitle(title);
  const tail = parts.length > 2 ? parts.slice(2).join(" - ") : title;
  if (!tail.trim()) return false;
  if (/[^\x00-\x7F]/.test(tail)) return true; // diacritics or non-Latin script
  return !/\b(the|of|and|for|with|services?|system|network|works?|supply|maintenance|project|framework|equipment|installation|construction|contract|tender|provision)\b/i.test(
    tail,
  );
}

/**
 * Derive the best available English rendering of a notice title.
 *
 * TED shape → "Country – English CPV label": both segments are English and
 * together they read as a title. Anything else is returned unchanged.
 *
 * Pure and total — same input, same output, no I/O. This is the whole of the
 * former translation feature's decision-making, and it is testable offline.
 */
export function deriveEnglishTitle(title: string): string {
  const raw = (title ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return raw;

  const parts = splitTitle(raw);
  // Needs at least Country – CPV label – native tail to be worth reshaping.
  if (parts.length < 3) return raw;
  if (!looksNonEnglish(raw)) return raw;

  const [country, cpvLabel] = parts;
  if (!cpvLabel) return raw;
  // A CPV label carrying non-ASCII is not the label we expected, so leave the
  // title exactly as published rather than guessing at its structure.
  if (/[^\x00-\x7F]/.test(cpvLabel)) return raw;

  return `${country} – ${cpvLabel}`.slice(0, 400);
}

export interface TranslateResult {
  /** Always true: derivation needs no API key and cannot be disabled. */
  enabled: boolean;
  /** Titles reshaped into their English CPV form. */
  derived: number;
  /** Titles already English, copied across unchanged. */
  alreadyEnglish: number;
  /** Still awaiting a pass. */
  remaining: number;
}

/**
 * Fill `title_en` for up to `limit` rows that have not been processed yet.
 *
 * Bounded per call so the ingest cron can run it inside its 300s budget, and
 * safe to call repeatedly: it only ever touches rows with translated = FALSE.
 */
export async function translatePending(limit = 60): Promise<TranslateResult> {
  const sql = getSql();
  if (!sql) return { enabled: true, derived: 0, alreadyEnglish: 0, remaining: 0 };

  let pending: PendingRow[];
  try {
    // In-domain rows only. The table also retains out-of-domain notices the
    // portal never surfaces; reshaping those would be work nobody can see.
    pending = (await sql.query(
      `SELECT id, title, source FROM opportunities
        WHERE translated = FALSE AND service_line = ANY($1)
        ORDER BY ingested_at DESC
        LIMIT $2`,
      [TARGET_SERVICE_LINES, limit],
    )) as PendingRow[];
  } catch {
    return { enabled: true, derived: 0, alreadyEnglish: 0, remaining: 0 };
  }

  let derived = 0;
  let alreadyEnglish = 0;

  // Batched writes. This was one UPDATE per row, and on Neon's HTTP driver a
  // statement is a full network round trip — 60 rows meant 60 of them, inside
  // the ingest cron's 300s budget. A single UPDATE ... FROM (VALUES …) applies
  // the whole batch in one trip.
  const writes = pending.map((row) => {
    const english = TITLE_IS_FINAL.has(row.source) ? row.title : deriveEnglishTitle(row.title);
    return { id: row.id, english, changed: english !== row.title };
  });

  const BATCH = 200;
  for (let start = 0; start < writes.length; start += BATCH) {
    const batch = writes.slice(start, start + BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((w, n) => {
      params.push(w.id, w.english);
      // Postgres needs the types on the first row of a VALUES list to infer
      // the rest of the column.
      return n === 0 ? `($1::text, $2::text)` : `($${n * 2 + 1}, $${n * 2 + 2})`;
    });
    try {
      await sql.query(
        `UPDATE opportunities AS o
            SET title_en = v.title_en, translated = TRUE, updated_at = now()
           FROM (VALUES ${tuples.join(",")}) AS v(id, title_en)
          WHERE o.id = v.id`,
        params,
      );
      // Counted only once the write lands, so the reported figures describe
      // what is actually in the table.
      for (const w of batch) {
        if (w.changed) derived++;
        else alreadyEnglish++;
      }
    } catch {
      // Leave this batch for the next pass rather than half-writing it. The
      // rows keep translated = FALSE, so they are simply picked up again.
    }
  }

  let remaining = 0;
  try {
    const r = (await sql.query(
      `SELECT COUNT(*)::int AS n FROM opportunities
        WHERE translated = FALSE AND service_line = ANY($1)`,
      [TARGET_SERVICE_LINES],
    )) as { n: number }[];
    remaining = r[0]?.n ?? 0;
  } catch {
    /* reporting only */
  }

  return { enabled: true, derived, alreadyEnglish, remaining };
}
