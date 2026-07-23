import { NextResponse } from "next/server";
import { facets } from "@/lib/repository";

// GET /api/facets — distinct values powering the Explorer filter dropdowns
export async function GET() {
  return NextResponse.json(facets());
}
