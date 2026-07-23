import { NextResponse } from "next/server";
import { dashboardStats, queryProjects } from "@/lib/repository";

// GET /api/dashboard — KPI stats + recent opportunities
export async function GET() {
  const stats = dashboardStats();
  const recent = queryProjects({ sort: "publicationDate", pageSize: 6 }).items;
  return NextResponse.json({ stats, recent });
}
