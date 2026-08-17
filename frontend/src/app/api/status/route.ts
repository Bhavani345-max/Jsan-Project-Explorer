import { NextResponse } from "next/server";
import { countInDomain, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/status — is real ingested data present? Drives the sidebar
// "Live data connected" vs "Sample dataset" marker.
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ live: false, count: 0 });
  // Counts in-domain rows only — the same set the portal renders.
  const count = await countInDomain();
  return NextResponse.json({ live: count > 0, count });
}
