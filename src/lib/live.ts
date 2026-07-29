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
  return { projects: PROJECTS, live: false };
}
