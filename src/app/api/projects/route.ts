import { NextResponse } from "next/server";
import { queryProjects } from "@/lib/repository";
import { backendQueryProjects } from "@/lib/backend";
import type { ProjectQuery } from "@/lib/types";

// GET /api/projects — filtered, paginated project search.
// Tries the live FastAPI backend first (real ingested tenders); falls back to
// the in-memory sample repository so the app still runs with zero infra.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  const str = (k: string) => p.get(k) ?? undefined;

  const query: ProjectQuery = {
    q: str("q"),
    country: str("country"),
    state: str("state"),
    category: str("category"),
    serviceLine: str("serviceLine"),
    presenceTier: str("presenceTier"),
    technology: str("technology"),
    projectType: str("projectType"),
    status: str("status"),
    organization: str("organization"),
    source: str("source"),
    minBudget: num("minBudget"),
    maxBudget: num("maxBudget"),
    minFit: num("minFit"),
    availableOnly: p.get("availableOnly") === "true",
    page: num("page"),
    pageSize: num("pageSize"),
    sort: (str("sort") as ProjectQuery["sort"]) ?? undefined,
  };

  // serviceLine/presenceTier/source/availableOnly/minFit are computed
  // client-side concepts the backend doesn't filter on — when they're set, use
  // the sample repository which supports them natively (keeps pagination exact).
  const backendCompatible =
    !query.serviceLine &&
    !query.presenceTier &&
    !query.source &&
    !query.availableOnly &&
    query.minFit == null;
  if (backendCompatible) {
    const live = await backendQueryProjects(query);
    if (live) return NextResponse.json({ ...live, live: true });
  }

  return NextResponse.json({ ...queryProjects(query), live: false });
}
