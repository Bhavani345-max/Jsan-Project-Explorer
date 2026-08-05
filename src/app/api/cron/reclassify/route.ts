import { NextResponse } from "next/server";
import { getSql, dbConfigured, countInDomain, countOpportunities } from "@/lib/db";
import { categorize, serviceLineFor, fitScoreFor, isGoodsProcurement } from "@/lib/ingest/normalize";
import { isTargetServiceLine } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Row {
  id: string;
  title: string;
  /** English rendering, which is where the procurement category appears. */
  title_en: string | null;
  description: string;
  category: string;
  service_line: string;
  budget_usd: string | number | null;
  fit_score: number | null;
  // The rule-based score reads these two as well as the text, so they have to
  // travel with the row or every rescored record loses its country and
  // deadline points.
  country: string | null;
  deadline: string | null;
}

/** The title the scope and scoring rules read — English where one exists. */
function displayTitle(r: Row): string {
  return r.title_en?.trim() || r.title;
}

/** One place that turns a stored row into the rule-based score. */
function scoreOf(r: Row): number {
  return fitScoreFor({
    title: displayTitle(r),
    description: r.description,
    budgetUsd: r.budget_usd == null ? null : Number(r.budget_usd),
    country: r.country,
    deadline: r.deadline,
    // The line the row is filed under sets the capability base, so a rescore
    // can never disagree with the classification.
    serviceLine: r.service_line,
  });
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
//   · promote only by default — a record already in the target domain is never
//     demoted out of it, so nothing visible can vanish unexpectedly. Rows the
//     current rules disagree with are reported for review.
//
// ?dryRun=1  report what would change, write nothing.
// ?demote=1  also apply the disagreements, moving mis-filed records back out
//            of the target domain. Opt-in, because it removes rows from view.
//            Still an UPDATE — the records themselves are retained.
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

  const flag = (name: string) => {
    const v = url.searchParams.get(name);
    return v === "1" || v === "true";
  };
  const dryRun = flag("dryRun");
  const demote = flag("demote");
  const startedAt = new Date().toISOString();

  try {
    const before = { inDomain: await countInDomain(), total: await countOpportunities() };

    const rows = (await sql.query(
      `SELECT id, title, title_en, description, category, service_line, budget_usd, country, deadline, fit_score
         FROM opportunities`,
    )) as Row[];

    // How much of the stored table is a goods/supply purchase. These rows are
    // hidden by the read gate and score 0 after this pass; nothing is deleted.
    const goodsRows = rows.filter((r) => isGoodsProcurement(displayTitle(r)));

    const promote: (Change & { fitScore: number })[] = [];
    const disagreements: (Change & { fitScore: number })[] = [];
    let unchanged = 0;

    // Every stored fit_score predates the current rule table, so a promotion
    // pass alone would leave the rest of the board ranked by the old maths.
    // Collect a rescore for every row whose stored score no longer matches;
    // still UPDATE-only, and still nothing is deleted.
    const rescore: { id: string; fitScore: number }[] = [];
    const histogram = new Map<string, number>();

    for (const r of rows) {
      const fresh = scoreOf(r);
      const bucket = `${Math.floor(fresh / 10) * 10}-${Math.floor(fresh / 10) * 10 + 9}`;
      histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
      if (Number(r.fit_score) !== fresh) rescore.push({ id: r.id, fitScore: fresh });
    }

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
      //
      // Read the English rendering where one exists: it carries the CPV label
      // AND an English native title, so a notice published in Lithuanian is
      // classified on words the rule table can actually match.
      const category = categorize(displayTitle(r));
      const serviceLine = serviceLineFor(category);
      const wasInDomain = isTargetServiceLine(r.service_line);
      const nowInDomain = isTargetServiceLine(serviceLine);

      const change = {
        id: r.id,
        title: displayTitle(r).slice(0, 110),
        from: r.service_line,
        to: serviceLine,
        category,
        fitScore: scoreOf(r),
      };

      if (r.service_line === serviceLine) {
        unchanged++;
      } else if (wasInDomain && !nowInDomain) {
        // Moves OUT of view. Opt-in only (?demote=1), because it takes a row
        // off the board.
        disagreements.push(change);
      } else {
        // Everything else is safe to apply: a promotion into the domain, or a
        // lateral move between two focus areas. The lateral case used to be
        // counted as "unchanged" and never written, which left rows filed under
        // whichever line an older rule set happened to pick — a staffing
        // framework stuck under Digital Engineering, for instance.
        promote.push(change);
      }
    }

    const toWrite = demote ? [...promote, ...disagreements] : promote;
    const reclassified = new Set(toWrite.map((p) => p.id));
    let written = 0;
    let rescored = 0;
    if (!dryRun) {
      for (const p of toWrite) {
        await sql.query(
          `UPDATE opportunities
              SET category = $1, service_line = $2, fit_score = $3, updated_at = now()
            WHERE id = $4`,
          [p.category, p.to, p.fitScore, p.id],
        );
        written++;
      }
      // Rows the reclassifier left alone still need the new score. Skip the
      // ones just written above so a record is never updated twice.
      for (const r of rescore) {
        if (reclassified.has(r.id)) continue;
        await sql.query(
          `UPDATE opportunities SET fit_score = $1, updated_at = now() WHERE id = $2`,
          [r.fitScore, r.id],
        );
        rescored++;
      }
    }

    const after = dryRun ? before : { inDomain: await countInDomain(), total: await countOpportunities() };

    return NextResponse.json({
      ok: true,
      dryRun,
      demote,
      demoted: demote ? disagreements.length : 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      scanned: rows.length,
      promoted: promote.length,
      written,
      rescored: dryRun ? rescore.length : rescored,
      unchanged,
      // Distribution of the rule-based score across every scanned row — the
      // evidence for where the high-fit threshold should sit.
      scoreHistogram: Object.fromEntries([...histogram.entries()].sort()),
      // Goods/supply purchases: hidden by the read gate and scored 0 by this
      // pass. Reported so the size of the exclusion is visible rather than
      // silently applied — the rows themselves are retained.
      goodsExcluded: goodsRows.length,
      sampleGoodsExcluded: goodsRows.slice(0, 25).map((r) => displayTitle(r).slice(0, 110)),
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
