import { NextResponse } from "next/server";
import { dbConfigured, recentIngestRuns } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/runs — read the ingest audit trail, newest first.
//
// Lives under /api/cron/ rather than /api/admin/ for one reason: middleware
// treats that prefix as session-free precisely because the routes beneath it
// carry their own CRON_SECRET bearer, and this endpoint is meant to be readable
// with the SAME token used to trigger a run by hand. Behind the session gate,
// "did last night's job work?" would be answerable only from a browser.
//
// Strictly read-only: it creates nothing, writes nothing, and no page in the
// portal consumes it.
//
// ?limit=N   runs to return (default 20, capped at 200).
export async function GET(request: Request): Promise<Response> {
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

  const requested = Number(url.searchParams.get("limit") ?? 20);
  const runs = await recentIngestRuns(Number.isFinite(requested) ? requested : 20);
  return NextResponse.json({ ok: true, count: runs.length, runs });
}
