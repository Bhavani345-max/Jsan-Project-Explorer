import { NextResponse } from "next/server";
import { countOpportunities, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/status — is real ingested data present? Drives the sidebar
// "Live data connected" vs "Sample dataset" marker.
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ live: false, count: 0 });
  const count = await countOpportunities();
  return NextResponse.json({ live: count > 0, count });
}
