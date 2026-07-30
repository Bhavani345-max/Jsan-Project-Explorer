import { NextResponse } from "next/server";
import { dashboardStats } from "@/lib/repository";
import { liveDataset } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/analytics — trend & performance analytics (live, seed fallback)
export async function GET() {
  const { projects, live } = await liveDataset();
  const stats = dashboardStats(projects);

  const orgTally = new Map<string, number>();
  for (const p of projects) orgTally.set(p.organization, (orgTally.get(p.organization) ?? 0) + 1);

  return NextResponse.json({
    perMonth: stats.perMonth,
    byCountry: stats.byCountry,
    byTechnology: stats.byTechnology,
    byCategory: stats.byCategory,
    // Straight counts, ordered by demand. No period-over-period delta: nothing
    // in the store records what last month's technology mix was.
    trendingTech: stats.byTechnology.slice(0, 6),
    topOrganizations: [...orgTally.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    // There is deliberately no won/pursued/successRate here. Those were derived
    // from `pursued = max(awarded, fitScore>=70 count)` — an invented
    // denominator, since nothing in the store records which opportunities were
    // actually bid on. Reporting a win rate needs a bid-tracking table first.
    countryCount: stats.countryCount,
    highFitCount: stats.highFitCount,
    live,
  });
}
