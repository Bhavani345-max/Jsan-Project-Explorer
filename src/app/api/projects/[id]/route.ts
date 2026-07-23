import { NextResponse } from "next/server";
import { getProject, relatedProjects } from "@/lib/repository";
import { backendGetProject } from "@/lib/backend";

// GET /api/projects/:id — single project + AI-recommended related projects.
// Live tenders come from the FastAPI backend; sample ids fall back to the
// in-memory repository (which also supplies related-project recommendations).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sample = getProject(id);
  if (sample) {
    return NextResponse.json({ project: sample, related: relatedProjects(sample), live: false });
  }

  const live = await backendGetProject(id);
  if (live) {
    return NextResponse.json({ project: live, related: [], live: true });
  }

  return NextResponse.json({ error: "Project not found" }, { status: 404 });
}
