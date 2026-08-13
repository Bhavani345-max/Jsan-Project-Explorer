import { NextResponse } from "next/server";
import { ensureSchema, dbConfigured } from "@/lib/db";
import { translatePending } from "@/lib/ingest/translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET|POST /api/cron/translate — derive English titles for stored notices.
//
// Separate from /api/cron/ingest on purpose. Ingest wires in a small batch for
// steady-state upkeep of newly-collected rows; clearing a large backlog (the
// first run faces ~425 unprocessed titles) needs several passes, and doing that
// inside ingest would put its 300s budget at risk.
//
// Safe to call repeatedly: it only ever touches rows with translated = FALSE, it
// writes to title_en and never overwrites the original title, and a row whose
// write fails is simply left for the next run.
//
// ?limit=N  titles to attempt this pass (default 120, capped at 400).
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const ok = auth === `Bearer ${secret}` || url.searchParams.get("key") === secret;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  const requested = Number(url.searchParams.get("limit") ?? 120);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 120, 1), 400);
  const startedAt = new Date().toISOString();

  try {
    await ensureSchema(); // adds title_en / translated on first run
    const result = await translatePending(limit);
    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      derived: result.derived,
      alreadyEnglish: result.alreadyEnglish,
      remaining: result.remaining,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, startedAt }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
