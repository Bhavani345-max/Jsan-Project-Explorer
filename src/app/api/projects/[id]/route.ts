import { NextResponse } from "next/server";
import { getProject, relatedProjects } from "@/lib/repository";
import { liveDataset } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/projects/:id — single opportunity + recommended related ones,
// resolved from the live dataset (with seed fallback).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects, live } = await liveDataset();

  const project = getProject(id, projects);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({ project, related: relatedProjects(project, 4, projects), live });
}
