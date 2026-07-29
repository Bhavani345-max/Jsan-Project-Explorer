// World Bank Projects — global development operations across ~150 borrower
// countries and their implementing agencies. Public API, no key required.
// We ingest ONLY currently-active operations and use each project's real
// closing date as the deadline, so nothing stale or long-closed leaks in.
import type { RawOpportunity } from "@/lib/ingest/normalize";

const BASE = "https://search.worldbank.org/api/v2/projects";
const SOURCE = "World Bank";
const SOURCE_KEY = "world-bank";

interface WbProject {
  id?: string;
  project_name?: string;
  status?: string;
  countryshortname?: string;
  totalamt?: string; // e.g. "200,000,000"
  boardapprovaldate?: string; // ISO
  closingdate?: string; // US format M/D/YYYY
  url?: string;
  project_abstract?: { "cdata!"?: string };
  sector?: { Name?: string }[];
  impagency?: string;
}

function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** World Bank closing dates come as M/D/YYYY; return ISO yyyy-mm-dd or null. */
function parseUsDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function fetchWorldBank(rows = 150): Promise<RawOpportunity[]> {
  const fl =
    "id,project_name,status,countryshortname,totalamt,boardapprovaldate,closingdate,url,project_abstract,sector,impagency";
  // status_exact=Active → only ongoing operations (drops closed/dropped/old).
  const url = `${BASE}?format=json&rows=${rows}&status_exact=Active&fl=${encodeURIComponent(fl)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`World Bank ${res.status}`);
  const body = (await res.json()) as { projects?: Record<string, WbProject> };
  const projects = body.projects ? Object.values(body.projects) : [];

  const out: RawOpportunity[] = [];
  for (const p of projects) {
    const title = (p.project_name ?? "").replace(/\s+/g, " ").trim();
    if (!p.id || !title) continue;
    if (p.status && p.status !== "Active") continue; // defensive
    const abstract = (p.project_abstract?.["cdata!"] ?? "").replace(/\s+/g, " ").trim();
    const sectors = (p.sector ?? []).map((s) => s.Name).filter(Boolean) as string[];
    out.push({
      sourceKey: SOURCE_KEY,
      source: SOURCE,
      sourceType: "Open Data Portal",
      referenceNumber: p.id,
      title,
      description: abstract || title,
      organization: (p.impagency ?? "").trim() || "World Bank borrower agency",
      country: (p.countryshortname ?? "").trim() || "Unknown",
      amount: parseAmount(p.totalamt),
      currency: "USD",
      deadline: parseUsDate(p.closingdate), // real operation closing date
      publicationDate: (p.boardapprovaldate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      officialLink: p.url ?? `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`,
      tags: sectors.slice(0, 3),
    });
  }
  return out;
}
