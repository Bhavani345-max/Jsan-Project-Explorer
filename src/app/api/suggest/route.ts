import { NextResponse } from "next/server";
import { suggest } from "@/lib/repository";
import { liveDataset } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/suggest?q= — smart-search autocomplete (live, seed fallback)
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const { projects } = await liveDataset();
  return NextResponse.json({ suggestions: suggest(q, 8, projects) });
}
