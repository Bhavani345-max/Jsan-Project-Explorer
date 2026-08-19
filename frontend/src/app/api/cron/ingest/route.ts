import { NextResponse } from "next/server";
import {
  ensureSchema,
  upsertOpportunities,
  purgeExpired,
  countOpportunities,
  countInDomain,
  dbConfigured,
  recordIngestRun,
  pruneIngestRuns,
} from "@/lib/db";
import { runConnectors, type SourceStat } from "@/lib/ingest/connectors";
import { translatePending } from "@/lib/ingest/translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Who asked for this run.
 *
 * Vercel Cron identifies itself with `user-agent: vercel-cron/1.0`; anything
 * else that gets this far arrived holding the bearer token, i.e. a person
 * running it by hand. Recorded so a gap in the trail reads correctly — a
 * missing 02:00 row means the schedule did not fire, and a manual run at noon
 * should not disguise that.
 */
function triggerOf(request: Request): string {
  return /vercel-cron/i.test(request.headers.get("user-agent") ?? "") ? "cron" : "manual";
}

// GET /api/cron/ingest — fetch every source, normalize, deduplicate,
// categorize, score and upsert into Neon.
// Triggered daily by Vercel Cron (which sends Authorization: Bearer CRON_SECRET)
// and can be run manually with the same bearer token.
//
// Every attempt, successful or not, appends a row to `ingest_runs`. Read it
// back with /api/cron/runs using the same token.
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const url = new URL(request.url);
    const ok = auth === `Bearer ${secret}` || url.searchParams.get("key") === secret;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!dbConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const startedAt = new Date().toISOString();
  const triggeredBy = triggerOf(request);
  // Hoisted out of the try so the failure path can still report whatever the
  // run had learned before it broke — which source threw is usually the answer.
  let stats: SourceStat[] = [];
  let fetched = 0;

  try {
    await ensureSchema();
    const collected = await runConnectors();
    stats = collected.stats;
    fetched = collected.rows.length;
    const written = await upsertOpportunities(collected.rows);
    const purged = await purgeExpired();
    // Steady-state upkeep only — enough to keep pace with a day's new notices.
    // A large backlog is cleared by calling /api/cron/translate directly, so a
    // one-off backfill can never threaten this run's 300s budget.
    const englishTitles = await translatePending(48);
    const total = await countOpportunities();
    const inDomain = await countInDomain();

    const runId = await recordIngestRun({
      startedAt,
      ok: true,
      triggeredBy,
      fetched,
      written,
      purged,
      inDomain,
      totalInDb: total,
      sources: stats,
    });
    // Upkeep of the trail itself, on the same schedule as everything else here.
    await pruneIngestRuns();

    return NextResponse.json({
      ok: true,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      sources: stats,
      openFetched: fetched,
      written,
      purgedExpired: purged,
      englishTitles,
      // inDomain is what the portal shows; totalInDb includes older
      // out-of-domain rows, which are retained but never surfaced.
      inDomain,
      totalInDb: total,
    });
  } catch (err) {
    const message = (err as Error).message;
    // The entire point of the trail: a run that dies must leave a row behind.
    // recordIngestRun never throws, so this cannot swallow the real failure.
    const runId = await recordIngestRun({
      startedAt,
      ok: false,
      triggeredBy,
      error: message,
      fetched,
      sources: stats,
    });
    return NextResponse.json({ ok: false, runId, error: message, startedAt }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
