import { NextResponse } from "next/server";
import { queryProjects } from "@/lib/repository";
import { liveDataset } from "@/lib/live";
import type { ProjectQuery } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/projects — filtered, paginated project search.
// Reads real ingested opportunities from the database; falls back to the
// in-memory sample dataset when the DB is empty or unreachable.
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

  const { projects, live } = await liveDataset();
  return NextResponse.json({ ...queryProjects(query, projects), live });
}
