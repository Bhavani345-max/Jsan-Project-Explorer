import { NextResponse } from "next/server";
import { getSql, dbConfigured, countInDomain, countOpportunities } from "@/lib/db";
import { categorize, serviceLineFor, fitScoreFor } from "@/lib/ingest/normalize";
import { isTargetServiceLine } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Row {
  id: string;
  title: string;
  description: string;
  category: string;
  service_line: string;
  budget_usd: string | number | null;
}

interface Change {
  id: string;
  title: string;
  from: string;
  to: string;
  category: string;
}

// GET|POST /api/cron/reclassify — re-run the current categorizer across rows
// that were stored under earlier, weaker rules, and promote the ones that are
// really geospatial or telecom work so they surface in the portal.
//
// Deliberately conservative:
//   · UPDATE only — no row is ever deleted;
//   · promote only — a record already in the target domain is never demoted
//     out of it, so nothing that is visible today can disappear. Rows the
//     current rules would disagree with are reported, not changed.
//
// ?dryRun=1  report what would change, write nothing.
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
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });

  const dryRunParam = url.searchParams.get("dryRun");
  const dryRun = dryRunParam === "1" || dryRunParam === "true";
  const startedAt = new Date().toISOString();

  try {
    const before = { inDomain: await countInDomain(), total: await countOpportunities() };

    const rows = (await sql.query(
      `SELECT id, title, description, category, service_line, budget_usd FROM opportunities`,
    )) as Row[];

    const promote: (Change & { fitScore: number })[] = [];
    const disagreements: Change[] = [];
    let unchanged = 0;

    for (const r of rows) {
      // Classify on the TITLE ONLY, deliberately stricter than ingest.
      //
      // Ingest reads title + description to maximise recall on new notices.
      // Here we are promoting records that are already stored, so precision
      // matters more: World Bank abstracts run long and mention "network" or
      // "broadband" in passing, which drags in things like agriculture and
      // disaster-relief programmes. A domain term in the title is a far more
      // reliable signal — and TED titles carry the CPV label, so real telecom
      // and surveying work still matches.
      const category = categorize(r.title);
      const serviceLine = serviceLineFor(category);
      const wasInDomain = isTargetServiceLine(r.service_line);
      const nowInDomain = isTargetServiceLine(serviceLine);

      if (!wasInDomain && nowInDomain) {
        const budget = r.budget_usd == null ? null : Number(r.budget_usd);
        promote.push({
          id: r.id,
          title: r.title.slice(0, 110),
          from: r.service_line,
          to: serviceLine,
          category,
          fitScore: fitScoreFor(serviceLine, budget, true),
        });
      } else {
        // Already in-domain but the current rules read it differently — surfaced
        // for review only. Never applied, so nothing visible is taken away.
        if (wasInDomain && !nowInDomain) {
          disagreements.push({
            id: r.id,
            title: r.title.slice(0, 110),
            from: r.service_line,
            to: serviceLine,
            category,
          });
        }
        unchanged++;
      }
    }

    let written = 0;
    if (!dryRun) {
      for (const p of promote) {
        await sql.query(
          `UPDATE opportunities
              SET category = $1, service_line = $2, fit_score = $3, updated_at = now()
            WHERE id = $4`,
          [p.category, p.to, p.fitScore, p.id],
        );
        written++;
      }
    }

    const after = dryRun ? before : { inDomain: await countInDomain(), total: await countOpportunities() };

    return NextResponse.json({
      ok: true,
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      scanned: rows.length,
      promoted: promote.length,
      written,
      unchanged,
      byCategory: promote.reduce<Record<string, number>>((acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      }, {}),
      before,
      after,
      // Rows retained but still out of domain — kept, never deleted.
      retainedOutOfDomain: after.total - after.inDomain,
      samplePromoted: promote.slice(0, 25).map((p) => `[${p.category}] ${p.title}`),
      reviewDisagreements: disagreements.slice(0, 25).map((d) => `${d.from} -> ${d.to} | ${d.title}`),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, startedAt }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
