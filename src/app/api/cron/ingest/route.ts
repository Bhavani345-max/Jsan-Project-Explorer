import { NextResponse } from "next/server";
import {
  ensureSchema,
  upsertOpportunities,
  purgeExpired,
  countOpportunities,
  countInDomain,
  dbConfigured,
} from "@/lib/db";
import { runConnectors } from "@/lib/ingest/connectors";
import { enrichPending } from "@/lib/ingest/ai-enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/cron/ingest — fetch every source, upsert into Neon, AI-enrich.
// Triggered daily by Vercel Cron (which sends Authorization: Bearer CRON_SECRET)
// and can be run manually with the same bearer token.
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
  try {
    await ensureSchema();
    const { rows, stats } = await runConnectors();
    const written = await upsertOpportunities(rows);
    const purged = await purgeExpired();
    const enrichment = await enrichPending();
    const total = await countOpportunities();
    const inDomain = await countInDomain();

    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      sources: stats,
      openFetched: rows.length,
      written,
      purgedExpired: purged,
      enrichment,
      // inDomain is what the portal shows; totalInDb includes older
      // out-of-domain rows, which are retained but never surfaced.
      inDomain,
      totalInDb: total,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, startedAt },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
