// Optional AI enrichment of ingested opportunities.
//
// Refines the auto-generated summary into a crisp 1–2 sentence brief using
// OpenRouter. Defaults to a FREE model so enrichment costs nothing; override
// with OPENROUTER_ENRICH_MODEL. Entirely best-effort: any failure leaves the
// deterministic heuristic summary in place and never breaks ingestion.
import { getSql } from "@/lib/db";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Zero-cost by default: a chain of FREE models tried in order per row, so a
// single provider's upstream rate limit (429) doesn't stall enrichment.
// Override the whole chain with OPENROUTER_ENRICH_MODEL (comma-separated).
const DEFAULT_MODELS = [
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-26b-a4b-it:free",
];

interface PendingRow {
  id: string;
  title: string;
  description: string;
  country: string;
  service_line: string;
}

async function callModel(prompt: string, apiKey: string, model: string): Promise<string | null> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Bhavani345-max",
        "X-Title": "Project Discovery Portal",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 90,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null; // 429/402/etc → let the caller try the next model
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text ? text.replace(/\s+/g, " ").slice(0, 300) : null;
  } catch {
    return null;
  }
}

async function summarize(row: PendingRow, apiKey: string, models: string[]): Promise<string | null> {
  const prompt =
    `Summarize this public-sector opportunity in ONE concise sentence (max 40 words) for a ` +
    `business-development team at an engineering consultancy. Be factual, no preamble.\n\n` +
    `Title: ${row.title}\nCountry: ${row.country}\nRelevant service line: ${row.service_line}\n` +
    `Details: ${(row.description || "").slice(0, 1200)}`;
  for (const model of models) {
    const text = await callModel(prompt, apiKey, model);
    if (text) return text;
  }
  return null;
}

/** Enrich up to `limit` un-enriched rows. No-op when no API key is set. */
export async function enrichPending(limit = 12): Promise<{ enabled: boolean; enriched: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const sql = getSql();
  if (!apiKey || !sql) return { enabled: false, enriched: 0 };
  const models = (process.env.OPENROUTER_ENRICH_MODEL?.split(",").map((s) => s.trim()).filter(Boolean))
    ?? DEFAULT_MODELS;
  if (models.length === 0) models.push(...DEFAULT_MODELS);

  let pending: PendingRow[];
  try {
    pending = (await sql.query(
      `SELECT id, title, description, country, service_line
         FROM opportunities
        WHERE ai_enriched = FALSE
        ORDER BY ingested_at DESC
        LIMIT $1`,
      [limit],
    )) as PendingRow[];
  } catch {
    return { enabled: true, enriched: 0 };
  }

  let enriched = 0;
  for (const row of pending) {
    const summary = await summarize(row, apiKey, models);
    if (!summary) continue;
    try {
      await sql.query(
        `UPDATE opportunities SET summary = $1, ai_enriched = TRUE, updated_at = now() WHERE id = $2`,
        [summary, row.id],
      );
      enriched++;
    } catch {
      /* leave heuristic summary in place */
    }
  }
  return { enabled: true, enriched };
}
