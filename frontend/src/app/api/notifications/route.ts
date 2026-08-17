import { NextResponse } from "next/server";
import { newOpportunities } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enough to fill the panel and leave room to scroll, without turning a poll
// into a page of the Explorer.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// GET /api/notifications — newest opportunities in the portal (live, seed
// fallback). Gated by the middleware's deny-by-default rule like every other
// non-public route; there is nothing to authorize per-user because the feed is
// identical for everyone.
export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), MAX_LIMIT) : DEFAULT_LIMIT;
  const { items, live } = await newOpportunities(limit);
  return NextResponse.json({ items, live, generatedAt: new Date().toISOString() });
}
