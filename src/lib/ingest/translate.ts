// ------------------------------------------------------------------
// English translation of ingested notice titles.
//
// 93% of stored notices are not in English: TED renders every title as
// "Country – <English CPV label> – <native title>", and that native tail arrives
// in Polish, Lithuanian, French, Croatian, Spanish, German and 20-odd others.
//
// Translation happens HERE, server-side at ingest, rather than in the browser,
// because the portal's job is discovery: the Explorer's keyword search and the
// facets all read the stored title. A client-side page widget would translate
// what is painted on screen and leave both of those monolingual — searching
// "cadastral survey" would still never match "kadastrinių matavimų".
//
// The original is never overwritten. It stays in `title`; the translation lands
// in `title_en`, and the read layer prefers the translation while keeping the
// original available for provenance.
//
// Same contract as ai-enrich.ts: entirely optional and best-effort. With no API
// key nothing is translated and original titles are shown, so the portal still
// runs with zero configuration.
// ------------------------------------------------------------------
import { getSql } from "@/lib/db";
import { TARGET_SERVICE_LINES } from "@/lib/domain";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free models first, tried in order, so one provider's rate limit doesn't stall
// the batch. Override the whole chain with OPENROUTER_TRANSLATE_MODEL.
const DEFAULT_MODELS = [
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-26b-a4b-it:free",
];

/**
 * Free models, then whatever OPENROUTER_MODEL names, as a last resort.
 *
 * OpenRouter's free tier is capped per ACCOUNT PER DAY (50 requests), not per
 * model — so once it is spent every `:free` model returns 429 together and a
 * free-only chain silently translates nothing for the rest of the day. That is
 * exactly what happened on the first backfill attempt: 0 translated, three
 * models, one shared quota.
 *
 * The fallback is billable, so it is only ever the model the operator named in
 * OPENROUTER_MODEL — never something picked here. That variable was originally
 * the chat assistant's; the assistant has since been removed, but this chain
 * still reads it, so it must stay configured. Set OPENROUTER_TRANSLATE_MODEL to
 * take full control, including pinning it back to free-only.
 */
function modelChain(): string[] {
  const explicit = process.env.OPENROUTER_TRANSLATE_MODEL?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit?.length) return explicit;

  const chain = [...DEFAULT_MODELS];
  const configured = process.env.OPENROUTER_MODEL?.trim();
  if (configured && !chain.includes(configured)) chain.push(configured);
  return chain;
}

// Titles per model call. One-per-call would need ~425 requests to clear the
// current backlog; at 12 per call it is ~36. Larger batches raise the chance of
// the model losing the numbering, which costs the whole batch.
const BATCH = 12;

interface PendingRow {
  id: string;
  title: string;
}

/**
 * Cheap local pre-filter, so obviously-English titles never cost a model call.
 *
 * Deliberately biased toward translating: a false positive wastes one slot in a
 * batch and the model returns the text unchanged, whereas a false negative
 * leaves a foreign title on the page permanently.
 */
export function looksNonEnglish(title: string): boolean {
  // TED shape: "Country – English CPV label – native title". Only the tail is
  // ever foreign, and testing the whole string would flag every TED notice on
  // the strength of its English CPV label.
  const parts = title.split(/\s+[–—-]\s+/);
  const tail = parts.length > 2 ? parts.slice(2).join(" - ") : title;
  if (!tail.trim()) return false;
  if (/[^\x00-\x7F]/.test(tail)) return true; // diacritics or non-Latin script
  return !/\b(the|of|and|for|with|services?|system|network|works?|supply|maintenance|project|framework|equipment|installation|construction|contract|tender|provision)\b/i.test(
    tail,
  );
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
        temperature: 0,
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null; // 429/402/etc → caller tries the next model
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function buildPrompt(titles: string[]): string {
  const numbered = titles.map((t, i) => `${i + 1}| ${t}`).join("\n");
  return (
    `Translate each numbered public-procurement notice title into English.\n\n` +
    `Rules:\n` +
    `- Output EXACTLY one line per input, same order, formatted: <number>| <english title>\n` +
    `- If a title is already in English, repeat it unchanged.\n` +
    `- Translate only. Do not summarize, shorten, explain or add commentary.\n` +
    `- Keep reference codes, identifiers and proper nouns exactly as they appear.\n` +
    `- No preamble, no blank lines, no markdown.\n\n` +
    numbered
  );
}

/**
 * Parse the model's numbered reply back onto the batch.
 *
 * Returns a sparse map, and unmatched lines are simply dropped: a row that fails
 * to parse keeps translated = FALSE and is retried on the next run, which is
 * always preferable to writing a mis-aligned translation onto the wrong notice.
 */
function parseReply(reply: string, expected: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of reply.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[|.)\]]\s*(.+?)\s*$/);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    const text = m[2].trim();
    if (idx < 0 || idx >= expected || !text) continue;
    if (!out.has(idx)) out.set(idx, text.slice(0, 400));
  }
  return out;
}

export interface TranslateResult {
  enabled: boolean;
  translated: number; // titles rewritten by the model
  alreadyEnglish: number; // marked done locally, no model call
  remaining: number; // still awaiting translation
}

/**
 * Translate up to `limit` untranslated titles. No-op without an API key.
 *
 * Bounded per call so it can be wired into the ingest cron for steady-state
 * upkeep without threatening its 300s budget, while /api/cron/translate can be
 * called repeatedly to clear a large backfill.
 */
export async function translatePending(limit = 60): Promise<TranslateResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const sql = getSql();
  if (!sql) return { enabled: false, translated: 0, alreadyEnglish: 0, remaining: 0 };

  const models = modelChain();

  let pending: PendingRow[];
  try {
    // In-domain rows only. The table also retains out-of-domain notices that the
    // portal never surfaces (currently ~330 of ~790); translating those would be
    // paying to render text nobody can see.
    pending = (await sql.query(
      `SELECT id, title FROM opportunities
        WHERE translated = FALSE AND service_line = ANY($1)
        ORDER BY ingested_at DESC
        LIMIT $2`,
      [TARGET_SERVICE_LINES, limit],
    )) as PendingRow[];
  } catch {
    return { enabled: Boolean(apiKey), translated: 0, alreadyEnglish: 0, remaining: 0 };
  }

  // Settle the already-English rows locally first — no model call, and it stops
  // them being re-selected on every subsequent run.
  const needsModel: PendingRow[] = [];
  const english: PendingRow[] = [];
  for (const row of pending) (looksNonEnglish(row.title) ? needsModel : english).push(row);

  let alreadyEnglish = 0;
  for (const row of english) {
    try {
      await sql.query(
        `UPDATE opportunities SET title_en = title, translated = TRUE, updated_at = now() WHERE id = $1`,
        [row.id],
      );
      alreadyEnglish++;
    } catch {
      /* retried next run */
    }
  }

  let translated = 0;
  if (apiKey) {
    for (let start = 0; start < needsModel.length; start += BATCH) {
      const batch = needsModel.slice(start, start + BATCH);
      const prompt = buildPrompt(batch.map((r) => r.title));

      let parsed: Map<number, string> | null = null;
      for (const model of models) {
        const reply = await callModel(prompt, apiKey, model);
        if (!reply) continue;
        const candidate = parseReply(reply, batch.length);
        // Require most of the batch to come back before trusting the alignment.
        if (candidate.size >= Math.ceil(batch.length / 2)) {
          parsed = candidate;
          break;
        }
      }
      if (!parsed) continue; // whole batch retried next run

      for (const [idx, text] of parsed) {
        const row = batch[idx];
        if (!row) continue;
        try {
          await sql.query(
            `UPDATE opportunities SET title_en = $1, translated = TRUE, updated_at = now() WHERE id = $2`,
            [text, row.id],
          );
          translated++;
        } catch {
          /* retried next run */
        }
      }
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

  return { enabled: Boolean(apiKey), translated, alreadyEnglish, remaining };
}
