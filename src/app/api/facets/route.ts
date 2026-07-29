import { NextResponse } from "next/server";
import { facets } from "@/lib/repository";
import { liveDataset } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/facets — distinct values powering the Explorer filter dropdowns
export async function GET() {
  const { projects } = await liveDataset();
  return NextResponse.json(facets(projects));
}
