// ------------------------------------------------------------------
// Live backend client (server-side only — used by route handlers).
//
// Talks to the Python/FastAPI service and maps its responses onto the
// frontend Project shape. Every function returns null when the backend
// is unreachable so callers can fall back to the in-memory sample
// repository — the app keeps its "runs with zero infrastructure"
// property while automatically upgrading to live data when the stack
// is up (docker compose).
// ------------------------------------------------------------------
import type { PagedProjects } from "@/lib/repository";
import type { Project, ProjectQuery } from "@/lib/types";
import { presenceFor } from "@/lib/presence";

const API_BASE =
  process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
// Dev/demo service account (seeded in db/sample_data.sql). Override in prod.
const SERVICE_EMAIL = process.env.BACKEND_SERVICE_EMAIL ?? "admin@discovery.io";
const SERVICE_PASSWORD = process.env.BACKEND_SERVICE_PASSWORD ?? "Admin#2026!";

const FETCH_TIMEOUT_MS = 4000;

// ---- service-account token cache ----------------------------------
let cachedToken: { value: string; expiresAt: number } | null = null;

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  try {
    const res = await timedFetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SERVICE_EMAIL, password: SERVICE_PASSWORD }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    // refresh 5 minutes before expiry
    const ttlMs = ((body.expiresInMinutes ?? 60) - 5) * 60_000;
    cachedToken = { value: body.accessToken, expiresAt: Date.now() + ttlMs };
    return cachedToken.value;
  } catch {
    return null;
  }
}

// ---- mapping -------------------------------------------------------
interface BackendProject {
  id: string;
  referenceNumber: string;
  title: string;
  description: string | null;
  aiSummary: string | null;
  aiFitScore: number | null;
  aiServiceLine: string | null;
  organization: { name: string; industry: string | null } | null;
  category: { name: string } | null;
  source: { name: string; sourceType: string } | null;
  country: string | null;
  state: string | null;
  budgetUsd: number | null;
  currency: string | null;
  projectType: string | null;
  status: string;
  eligibility: string | null;
  officialLink: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  tags: string[] | null;
  deadline: string | null;
  publicationDate: string;
  technologies: { name: string }[];
}

function budgetLabel(amount: number | null, currency: string | null): string {
  if (amount == null) return "Undisclosed";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sym}${Math.round(amount / 1_000)}K`;
  return `${sym}${amount}`;
}

/** Map a live tender onto a JSAN service line from its text. */
function serviceLineFor(text: string): Project["serviceLine"] {
  const t = text.toLowerCase();
  if (/\bgis\b|geospatial|mapping|spatial/.test(t)) return "Geospatial Intelligence";
  if (/telecom|fibre|fiber|5g|network|broadband/.test(t)) return "Telecom & Network Engineering";
  if (/programme management|program management|pmo/.test(t)) return "Structured Program Management";
  if (/staff|workforce|recruitment|resourcing/.test(t)) return "Strategic Workforce Solutions";
  return "Digital Engineering";
}

function fitScoreFor(p: BackendProject, serviceLine: string): number {
  // Simple transparent heuristic: core service lines score higher, budget
  // and an approaching-but-comfortable deadline add a little.
  let score = 40;
  if (serviceLine === "Geospatial Intelligence" || serviceLine === "Telecom & Network Engineering") score += 30;
  else if (serviceLine === "Digital Engineering") score += 15;
  if ((p.budgetUsd ?? 0) >= 1_000_000) score += 15;
  else if ((p.budgetUsd ?? 0) >= 100_000) score += 8;
  if (p.category) score += 7;
  return Math.min(97, score);
}

function toFrontend(p: BackendProject): Project {
  const country = p.country ?? "Unknown";
  const presence = presenceFor(country);
  const text = `${p.title} ${p.description ?? ""} ${p.category?.name ?? ""}`;
  // Prefer real AI enrichment (OpenRouter) over the keyword heuristic
  const serviceLine = (p.aiServiceLine as Project["serviceLine"]) ?? serviceLineFor(text);
  const daysLeft = p.deadline
    ? Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86_400_000)
    : null;
  const status: Project["status"] =
    p.status === "Closed" ? "Closed"
      : daysLeft != null && daysLeft <= 7 ? "Closing Soon"
      : "Open";

  return {
    id: p.id,
    referenceNumber: p.referenceNumber,
    title: p.title,
    description: p.description ?? "",
    summary: p.aiSummary ?? (p.description ? `${p.description.slice(0, 220)}…` : p.title),
    organization: p.organization?.name ?? "Unknown organization",
    country,
    state: p.state ?? "",
    budget: p.budgetUsd,
    budgetLabel: budgetLabel(p.budgetUsd, p.currency),
    currency: p.currency ?? "USD",
    deadline: p.deadline ?? "",
    publicationDate: p.publicationDate,
    source: p.source?.name ?? "Live source",
    sourceType: (p.source?.sourceType ?? "Public Tender API") as Project["sourceType"],
    category: (p.category?.name ?? "Enterprise Software") as Project["category"],
    serviceLine,
    fitScore: p.aiFitScore ?? fitScoreFor(p, serviceLine),
    presenceTier: presence.tier,
    presenceLabel: presence.label,
    presenceRank: presence.rank,
    projectType: (p.projectType ?? "Open Opportunity") as Project["projectType"],
    status,
    technologies: p.technologies.map((t) => t.name),
    tags: p.tags ?? [],
    eligibility: p.eligibility ?? "See the official notice for eligibility criteria.",
    officialLink: p.officialLink ?? "",
    contact: p.contactEmail || p.contactName || p.contactPhone
      ? { name: p.contactName ?? undefined, email: p.contactEmail ?? undefined, phone: p.contactPhone ?? undefined }
      : null,
    industry: p.organization?.industry ?? "Public Sector",
  };
}

// ---- queries -------------------------------------------------------
const SORT_MAP: Record<string, string> = {
  deadline: "deadline",
  budget: "budget",
  publicationDate: "publicationDate",
  // Backend has no footprint/fit ordering — deadline is the closest proxy;
  // priority re-sort happens below on the fetched page.
  priority: "deadline",
  fitScore: "deadline",
};

export async function backendQueryProjects(q: ProjectQuery): Promise<PagedProjects | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const params = new URLSearchParams();
    if (q.q) params.set("q", q.q);
    if (q.country) params.set("country", q.country);
    if (q.state) params.set("state", q.state);
    if (q.category) params.set("category", q.category);
    if (q.technology) params.set("technology", q.technology);
    if (q.projectType) params.set("projectType", q.projectType);
    if (q.status) params.set("status", q.status);
    if (q.organization) params.set("organization", q.organization);
    if (q.minBudget != null) params.set("minBudget", String(q.minBudget));
    if (q.maxBudget != null) params.set("maxBudget", String(q.maxBudget));
    params.set("page", String(Math.max(0, (q.page ?? 1) - 1))); // 1-based → 0-based
    params.set("size", String(q.pageSize ?? 8));
    params.set("sort", SORT_MAP[q.sort ?? "priority"] ?? "deadline");

    const res = await timedFetch(`${API_BASE}/api/v1/projects?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const page = await res.json();
    let items = (page.content as BackendProject[]).map(toFrontend);
    if ((q.sort ?? "priority") === "priority") {
      items = [...items].sort(
        (a, b) => b.presenceRank - a.presenceRank || b.fitScore - a.fitScore,
      );
    }
    return {
      items,
      total: page.totalElements,
      page: page.number + 1, // 0-based → 1-based
      pageSize: page.size,
      totalPages: Math.max(1, page.totalPages),
    };
  } catch {
    return null;
  }
}

export async function backendGetProject(id: string): Promise<Project | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await timedFetch(`${API_BASE}/api/v1/projects/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return toFrontend(await res.json());
  } catch {
    return null;
  }
}

/** Health probe used by /api/status to drive the live/sample UI marker. */
export async function backendAlive(): Promise<boolean> {
  try {
    const res = await timedFetch(`${API_BASE}/actuator/health`);
    return res.ok;
  } catch {
    return false;
  }
}
