import { NextResponse } from "next/server";
import { listConnectors, connectorLogs } from "@/lib/repository";

// GET /api/connectors — configured data sources + recent collection logs
export async function GET() {
  return NextResponse.json({ connectors: listConnectors(), logs: connectorLogs() });
}
