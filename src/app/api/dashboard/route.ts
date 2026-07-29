import { NextResponse } from "next/server";
import { dashboardStats, queryProjects } from "@/lib/repository";
import { liveDataset } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard — KPI stats + recent opportunities (live, seed fallback)
export async function GET() {
  const { projects, live } = await liveDataset();
  const stats = dashboardStats(projects);
  const recent = queryProjects({ sort: "publicationDate", pageSize: 6 }, projects).items;
  return NextResponse.json({ stats, recent, live });
}
