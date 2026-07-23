import { NextResponse } from "next/server";
import { backendAlive } from "@/lib/backend";

// GET /api/status — is the live backend reachable? Drives the sidebar
// "Live data connected" vs "Sample dataset" marker.
export async function GET() {
  const live = await backendAlive();
  return NextResponse.json({ live });
}
