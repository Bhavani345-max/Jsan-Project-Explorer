import { PROJECTS, CONNECTORS, CONNECTOR_LOGS } from "./seed";
import { JSAN_OFFICES, JSAN_OPERATING } from "./presence";
import { daysLeft } from "./format";
import type { Project, ProjectQuery, DashboardStats, APIConnector, ConnectorLog } from "./types";

// ------------------------------------------------------------------
// Repository pattern: the single seam between the domain and storage.
//
// Every query function takes the dataset to operate on, defaulting to the
// in-memory seed. Server routes pass the live database-backed dataset
// (see lib/live.ts) so the same pure logic serves real, day-by-day data —
// while the app still runs with zero infrastructure on the seed.
// ------------------------------------------------------------------

function matches(p: Project, q: ProjectQuery): boolean {
  if (q.q) {
    const needle = q.q.toLowerCase();
    const haystack = [
      p.title,
      p.description,
      p.organization,
      p.country,
      p.referenceNumber,
      p.id,
      ...p.technologies,
      ...p.tags,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (q.country && p.country !== q.country) return false;
  if (q.state && p.state !== q.state) return false;
  if (q.category && p.category !== q.category) return false;
  if (q.serviceLine && p.serviceLine !== q.serviceLine) return false;
  if (q.presenceTier && p.presenceTier !== q.presenceTier) return false;
  if (q.projectType && p.projectType !== q.projectType) return false;
  if (q.status && p.status !== q.status) return false;
  if (q.source && p.source !== q.source) return false;
  if (q.organization && p.organization !== q.organization) return false;
  if (q.technology && !p.technologies.includes(q.technology)) return false;
  if (q.minBudget != null && (p.budget == null || p.budget < q.minBudget)) return false;
  if (q.maxBudget != null && (p.budget == null || p.budget > q.maxBudget)) return false;
  if (q.minFit != null && p.fitScore < q.minFit) return false;
  // "Occupied" = the opportunity is already taken (Awarded) or the window has
  // closed — filter these out when the caller only wants pursuable work.
  if (q.availableOnly && (p.status === "Closed" || p.status === "Awarded")) return false;
  return true;
}

export interface PagedProjects {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function queryProjects(q: ProjectQuery, projects: Project[] = PROJECTS): PagedProjects {
  let items = projects.filter((p) => matches(p, q));

  const sort = q.sort ?? "priority";
  items = [...items].sort((a, b) => {
    // Priority = JSAN location footprint first, then capability fit, then deadline.
    if (sort === "priority")
      return (
        b.presenceRank - a.presenceRank ||
        b.fitScore - a.fitScore ||
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
    if (sort === "budget") return (b.budget ?? 0) - (a.budget ?? 0);
    if (sort === "fitScore") return b.fitScore - a.fitScore;
    if (sort === "publicationDate")
      return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime();
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const total = items.length;
  const page = Math.max(1, q.page ?? 1);
  const pageSize = q.pageSize ?? 8;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getProject(id: string, projects: Project[] = PROJECTS): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function relatedProjects(p: Project, limit = 4, projects: Project[] = PROJECTS): Project[] {
  return projects
    .filter((x) => x.id !== p.id)
    .map((x) => {
      const shared = x.technologies.filter((t) => p.technologies.includes(t)).length;
      const sameCat = x.category === p.category ? 2 : 0;
      const sameCountry = x.country === p.country ? 1 : 0;
      return { x, score: shared * 2 + sameCat + sameCountry };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.x);
}

function tally(items: Project[], key: (p: Project) => string): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const p of items) {
    const k = key(p);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function dashboardStats(projects: Project[] = PROJECTS): DashboardStats {
  const byTech = new Map<string, number>();
  for (const p of projects) for (const t of p.technologies) byTech.set(t, (byTech.get(t) ?? 0) + 1);

  const budgetBands = [
    { label: "< $1M", test: (b: number) => b < 1_000_000 },
    { label: "$1M–3M", test: (b: number) => b >= 1_000_000 && b < 3_000_000 },
    { label: "$3M–5M", test: (b: number) => b >= 3_000_000 && b < 5_000_000 },
    { label: "$5M–8M", test: (b: number) => b >= 5_000_000 && b < 8_000_000 },
    { label: "> $8M", test: (b: number) => b >= 8_000_000 },
  ];

  const perMonthLabels = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
  const perMonth = perMonthLabels.map((label, i) => ({
    label,
    value: 6 + Math.round(Math.sin(i * 1.1) * 3 + i * 1.4),
  }));

  // JSAN's target band: opportunities whose value falls in $1–10M.
  const TARGET_MIN = 1_000_000;
  const TARGET_MAX = 10_000_000;
  const inTarget = projects.filter(
    (p) => p.budget != null && p.budget >= TARGET_MIN && p.budget <= TARGET_MAX,
  );

  return {
    totalProjects: projects.length,
    newToday: projects.filter((p) => daysLeft(p.publicationDate) === 0).length,
    closingSoon: projects.filter((p) => p.status === "Closing Soon").length,
    totalBudget: projects.reduce((s, p) => s + (p.budget ?? 0), 0),
    targetPipeline: inTarget.reduce((s, p) => s + (p.budget ?? 0), 0),
    targetCount: inTarget.length,
    byCountry: tally(projects, (p) => p.country).slice(0, 8),
    byTechnology: [...byTech.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    byBudget: budgetBands.map((band) => ({
      label: band.label,
      value: projects.filter((p) => p.budget != null && band.test(p.budget)).length,
    })),
    bySource: tally(projects, (p) => p.source).slice(0, 8),
    byCategory: tally(projects, (p) => p.category),
    byServiceLine: tally(projects, (p) => p.serviceLine),
    byPresence: tally(projects, (p) => p.presenceTier),
    highFitCount: projects.filter((p) => p.fitScore >= 85).length,
    inFootprintCount: projects.filter((p) => p.presenceRank >= 2).length,
    perMonth,
  };
}

// -------- JSAN location footprint breakdown (dashboard panel) --------
export function jsanPresence(projects: Project[] = PROJECTS) {
  const byCountry = new Map<string, number>();
  for (const p of projects) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);

  const offices = JSAN_OFFICES.map((o) => ({
    country: o.country,
    city: o.city,
    short: o.short,
    tier: o.tier,
    count: byCountry.get(o.country) ?? 0,
  }));

  const operatingCountries = Object.keys(JSAN_OPERATING);
  const operatingCount = projects.filter((p) => operatingCountries.includes(p.country)).length;
  const officeSet = new Set(JSAN_OFFICES.map((o) => o.country));
  const newMarketCount = projects.filter(
    (p) => !officeSet.has(p.country) && !operatingCountries.includes(p.country),
  ).length;

  return { offices, operatingCount, operatingCountries, newMarketCount };
}

export interface FootprintPoint {
  country: string;
  city: string;
  short: string;
  tier: string;
  count: number;
  lat: number;
  lon: number;
}

// Geo points for the dashboard world map — offices + operating markets.
export function footprintPoints(projects: Project[] = PROJECTS): FootprintPoint[] {
  const byCountry = new Map<string, number>();
  for (const p of projects) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);

  const offices: FootprintPoint[] = JSAN_OFFICES.map((o) => ({
    country: o.country,
    city: o.city,
    short: o.short,
    tier: o.tier,
    count: byCountry.get(o.country) ?? 0,
    lat: o.lat,
    lon: o.lon,
  }));
  const operating: FootprintPoint[] = Object.entries(JSAN_OPERATING).map(([country, v]) => ({
    country,
    city: v.city,
    short: country,
    tier: "Operating",
    count: byCountry.get(country) ?? 0,
    lat: v.lat,
    lon: v.lon,
  }));
  return [...offices, ...operating];
}

// -------- facet helpers for filter dropdowns --------
export function facets(projects: Project[] = PROJECTS) {
  const uniq = (arr: string[]) => [...new Set(arr)].sort();
  return {
    countries: uniq(projects.map((p) => p.country)),
    states: uniq(projects.map((p) => p.state).filter(Boolean)),
    categories: uniq(projects.map((p) => p.category)),
    serviceLines: uniq(projects.map((p) => p.serviceLine)),
    presenceTiers: ["Headquarters", "Office", "Operating", "New Market"].filter((t) =>
      projects.some((p) => p.presenceTier === t),
    ),
    projectTypes: uniq(projects.map((p) => p.projectType)),
    statuses: uniq(projects.map((p) => p.status)),
    sources: uniq(projects.map((p) => p.source)),
    organizations: uniq(projects.map((p) => p.organization)),
    technologies: uniq(projects.flatMap((p) => p.technologies)),
    industries: uniq(projects.map((p) => p.industry)),
  };
}

// -------- smart search: autocomplete suggestions --------
export function suggest(
  term: string,
  limit = 8,
  projects: Project[] = PROJECTS,
): { type: string; value: string; sub?: string }[] {
  const t = term.toLowerCase().trim();
  if (!t) return [];
  const out: { type: string; value: string; sub?: string }[] = [];
  const seen = new Set<string>();
  const push = (type: string, value: string, sub?: string) => {
    const k = type + value;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ type, value, sub });
  };

  const f = facets(projects);
  f.serviceLines.filter((x) => x.toLowerCase().includes(t)).forEach((x) => push("Service Line", x));
  f.technologies.filter((x) => x.toLowerCase().includes(t)).forEach((x) => push("Technology", x));
  f.organizations.filter((x) => x.toLowerCase().includes(t)).forEach((x) => push("Organization", x));
  f.countries.filter((x) => x.toLowerCase().includes(t)).forEach((x) => push("Country", x));
  projects
    .filter((p) => p.title.toLowerCase().includes(t))
    .forEach((p) => push("Project", p.title, p.referenceNumber));
  return out.slice(0, limit);
}

export function listConnectors(): APIConnector[] {
  return CONNECTORS;
}
export function connectorLogs(connectorId?: string): ConnectorLog[] {
  return connectorId ? CONNECTOR_LOGS.filter((l) => l.connectorId === connectorId) : CONNECTOR_LOGS;
}
