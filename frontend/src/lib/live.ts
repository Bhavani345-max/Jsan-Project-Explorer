// ------------------------------------------------------------------
// Live dataset provider (server-only).
//
// The single seam the read layer uses to decide between real ingested data
// and the bundled sample. Returns persisted opportunities when the database
// has any, otherwise the in-memory seed — so the app always renders, and
// automatically "upgrades" to live data the moment the first ingest runs.
// ------------------------------------------------------------------
import type { Project } from "@/lib/types";
import { PROJECTS } from "@/lib/seed";
import { loadLiveProjects } from "@/lib/db";
import { toTargetDomain, meetsBoardBudgetPolicy } from "@/lib/domain";
import { isOutOfScope } from "@/lib/ingest/scope";

// The seed carries the full sample catalogue; narrow it to the target domain
// and drop any goods/supply notice so the zero-infrastructure demo shows
// exactly the same scope as the live portal. Nothing is removed from the seed
// itself — this is a view over it.
//
// The contract-value floor is deliberately NOT applied here. It is a collection
// rule — what the connectors are allowed to persist — and the seed is shipped,
// not collected, so the rule has nothing to act on. Applying it anyway would
// empty the sample catalogue outright (every seeded value predates the policy
// and sits below the floor) and the app would render a blank board the moment
// the database was unreachable, which is the one job this fallback has.
//
// The primary/secondary ranking still applies to the seed: it runs in
// queryProjects, over whatever dataset it is handed.
const SEED_IN_DOMAIN = toTargetDomain(PROJECTS).filter((p) => !isOutOfScope(p.title));

let cache: { projects: Project[]; at: number } | null = null;
const TTL_MS = 60_000;

export interface Dataset {
  projects: Project[];
  live: boolean;
}

/** Live opportunities (cached ~1 min per instance) with seed fallback. */
export async function liveDataset(): Promise<Dataset> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { projects: cache.projects, live: true };
  }
  const live = await loadLiveProjects();
  if (live && live.length) {
    // Board contract-value policy, applied at the single read seam so every
    // page inherits it at once: dashboard, Explorer, Analytics, details, the
    // notification feed and every /api route read through here.
    //
    // Applied HERE rather than inside loadLiveProjects: that function returns
    // null when its query yields nothing, and null means "database unreachable,
    // use the seed". Filtering in its SQL would make an over-tight threshold
    // silently masquerade as an outage and drop the portal onto sample data.
    // Active bids only.
    //
    // Belt and braces with purgeExpired(), not a replacement for it. The purge
    // runs once a night at ~02:00 UTC, so between midnight and that run every
    // notice whose bid end date passed the previous day was still on the board
    // — and a purge that ever failed would leave closed notices sitting there
    // until somebody noticed by eye. Enforcing it on read makes "the board
    // shows only live bids" true at every instant, whatever the job did last.
    //
    // statusFor() marks a notice Closed only once its bid end date is in the
    // past, so a tender closing TODAY is still shown, as it should be. A notice
    // that publishes no bid end date is not "completed" — it is unknown — and
    // stays; those age out on publication date via purgeExpired's 180-day rule.
    //
    // Applied at this seam rather than in loadLiveProjects's SQL for exactly
    // the reason given above for the value policy: that function returns null
    // to mean "database unreachable", so a filter that emptied its result set
    // would masquerade as an outage and drop the portal onto sample data.
    const board = live.filter((p) => p.status !== "Closed" && meetsBoardBudgetPolicy(p));
    cache = { projects: board, at: Date.now() };
    return { projects: board, live: true };
  }
  // The seed is deliberately NOT filtered, for the reason already stated above
  // for the collection floor: every seeded value sits below the primary line,
  // so applying the policy here would render a blank board at exactly the
  // moment this fallback exists to prevent one. The sidebar already marks this
  // state as "Sample dataset", so it is labelled, not passed off as live.
  return { projects: SEED_IN_DOMAIN, live: false };
}
