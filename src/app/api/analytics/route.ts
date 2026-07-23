import { NextResponse } from "next/server";
import { dashboardStats } from "@/lib/repository";
import { PROJECTS } from "@/lib/seed";

// GET /api/analytics — trend & performance analytics
export async function GET() {
  const stats = dashboardStats();

  // Simulated win/pipeline metrics for the analytics module
  const awarded = 7;
  const pursued = 19;
  const topOrganizations = [...stats.byCountry]; // placeholder shape reuse

  const orgTally = new Map<string, number>();
  for (const p of PROJECTS) orgTally.set(p.organization, (orgTally.get(p.organization) ?? 0) + 1);

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
    successRate: Math.round((awarded / pursued) * 100),
  });
}
