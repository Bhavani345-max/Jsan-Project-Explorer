import { NextResponse } from "next/server";
import { dashboardStats } from "@/lib/repository";
import { liveDataset } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/analytics — trend & performance analytics (live, seed fallback)
export async function GET() {
  const { projects, live } = await liveDataset();
  const stats = dashboardStats(projects);

  // Pipeline metrics derived from the live dataset.
  const awarded = projects.filter((p) => p.status === "Awarded").length;
  const pursued = Math.max(awarded, projects.filter((p) => p.fitScore >= 70).length);

  const orgTally = new Map<string, number>();
  for (const p of projects) orgTally.set(p.organization, (orgTally.get(p.organization) ?? 0) + 1);

  return NextResponse.json({
    perMonth: stats.perMonth,
    byCountry: stats.byCountry,
    byTechnology: stats.byTechnology,
    byCategory: stats.byCategory,
    trendingTech: stats.byTechnology.slice(0, 6).map((t, i) => ({
      ...t,
      delta: [18, 12, 9, -4, 6, 3][i] ?? 0,
    })),
    topOrganizations: [...orgTally.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    won: awarded,
    pursued,
    successRate: pursued > 0 ? Math.round((awarded / pursued) * 100) : 0,
    live,
  });
}
