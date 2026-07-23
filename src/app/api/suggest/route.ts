import { NextResponse } from "next/server";
import { suggest } from "@/lib/repository";

// GET /api/suggest?q= — smart-search autocomplete
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ suggestions: suggest(q) });
}
