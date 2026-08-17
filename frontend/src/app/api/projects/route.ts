import { NextResponse } from "next/server";
import { queryProjects, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/repository";
import { liveDataset } from "@/lib/live";
import type { ProjectQuery } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/projects — filtered, paginated project search.
// Reads real ingested opportunities from the database; falls back to the
// in-memory sample dataset when the DB is empty or unreachable.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const num = (k: string) => {
    const raw = p.get(k);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined; // ignore ?minBudget=abc
  };
  const str = (k: string) => p.get(k) ?? undefined;
  // Only a well-formed calendar date is accepted. Anything else is dropped
  // rather than passed through: a malformed bound would silently exclude every
  // record, which reads as "no results" instead of "bad filter".
  const isoDate = (k: string) => {
    const raw = p.get(k);
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
  };

  // Paging comes off the query string, so it is bounded here rather than in the
  // repository: a hand-typed ?pageSize=100000 would otherwise serialise the
  // whole store into one response. The high page is left to the repository,
  // which clamps it to the last page that actually exists.
  const pageSize = Math.min(Math.max(1, Math.trunc(num("pageSize") ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
  const page = Math.max(1, Math.trunc(num("page") ?? 1));

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
    maxDeadlineDays: num("maxDeadlineDays"),
    publishedFrom: isoDate("publishedFrom"),
    publishedTo: isoDate("publishedTo"),
    availableOnly: p.get("availableOnly") === "true",
    disclosedBudgetOnly: p.get("disclosedBudgetOnly") === "true",
    page,
    pageSize,
    sort: (str("sort") as ProjectQuery["sort"]) ?? undefined,
  };

  const { projects, live } = await liveDataset();
  return NextResponse.json({ ...queryProjects(query, projects), live });
}
