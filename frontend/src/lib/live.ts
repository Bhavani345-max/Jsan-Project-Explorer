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
import { toTargetDomain } from "@/lib/domain";
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
    cache = { projects: live, at: Date.now() };
    return { projects: live, live: true };
  }
  return { projects: SEED_IN_DOMAIN, live: false };
}
