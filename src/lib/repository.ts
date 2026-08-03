import { PROJECTS, CONNECTORS, CONNECTOR_LOGS } from "./seed";
import { TARGET_MIN_BUDGET_USD, TARGET_MAX_BUDGET_USD, HIGH_FIT_THRESHOLD } from "./domain";
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
      // Search the original wording too, so a buyer who knows the notice by its
      // native name ("kadastrinių matavimų") finds it just as readily as someone
      // searching the English translation ("cadastral surveying").
      p.originalTitle,
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
  if (q.projectType && p.projectType !== q.projectType) return false;
  if (q.status && p.status !== q.status) return false;
  if (q.source && p.source !== q.source) return false;
  if (q.organization && p.organization !== q.organization) return false;
  if (q.technology && !p.technologies.includes(q.technology)) return false;
  if (q.minBudget != null && (p.budget == null || p.budget < q.minBudget)) return false;
  if (q.maxBudget != null && (p.budget == null || p.budget > q.maxBudget)) return false;
  if (q.minFit != null && p.fitScore < q.minFit) return false;
  if (q.maxDeadlineDays != null) {
    // An unparseable or missing deadline cannot satisfy a deadline window —
    // including it would put rows in the results that the filter cannot vouch for.
    const d = daysLeft(p.deadline);
    if (Number.isNaN(d) || d < 0 || d > q.maxDeadlineDays) return false;
  }
  // "Occupied" = the opportunity is already taken (Awarded) or the window has
  // closed — filter these out when the caller only wants pursuable work.
  if (q.availableOnly && (p.status === "Closed" || p.status === "Awarded")) return false;
  return true;
}

export interface PagedProjects {
  items: Project[];
  total: number;
  /** The page actually served — clamped into range, so it can differ from the
   *  one asked for (see the clamp in queryProjects). */
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Page size when a caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 9;
/** Ceiling for a page size arriving from the query string — see the API route.
 *  Internal callers pass their own size and are not capped by this. */
export const MAX_PAGE_SIZE = 100;

/** `Number("abc")` from a query string is NaN, and NaN paging maths silently
 *  yields an empty slice with a NaN page number — fall back instead. */
function numberOr(value: number | undefined | null, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function queryProjects(q: ProjectQuery, projects: Project[] = PROJECTS): PagedProjects {
  let items = projects.filter((p) => matches(p, q));

  // Default ranking is capability fit, tie-broken by the nearest deadline. There
  // is no location-preference ranking: it is not a property of the opportunity,
  // and it pushed every country outside JSAN's office list onto the back pages.
  const sort = q.sort ?? "fitScore";
  const byDeadline = (a: Project, b: Project) =>
    new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  items = [...items].sort((a, b) => {
    if (sort === "budget") return (b.budget ?? 0) - (a.budget ?? 0);
    if (sort === "deadline") return byDeadline(a, b);
    if (sort === "publicationDate")
      return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime();
    // fitScore, and the fallback for any unrecognized value (e.g. an old
    // bookmarked ?sort=priority link).
    return b.fitScore - a.fitScore || byDeadline(a, b);
  });

  const total = items.length;
  const pageSize = Math.max(1, Math.trunc(numberOr(q.pageSize, DEFAULT_PAGE_SIZE)));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp into range rather than serving an empty slice. A bookmarked
  // ?page=40 whose filters now match three pages, or a page you were sitting
  // on when a filter narrowed the results, would otherwise come back with zero
  // items and read as "no opportunities found" — the last page is the honest
  // answer. Callers see the page they actually got, and correct themselves.
  const page = Math.min(Math.max(1, Math.trunc(numberOr(q.page, 1))), totalPages);

  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
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

// -------- monthly discovery trend --------
// Counted from the real publication dates on the records themselves. The window
// is a rolling N months ending at the *current* month, so the right-hand edge is
// always "now": if ingestion stalls, the line visibly falls to zero instead of
// the chart quietly re-scaling to the last month that happened to have data.
//
// Records published before the window are not shown here — they still appear
// everywhere else in the portal, this chart is only the recent trend.
export const TREND_MONTHS = 6;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function perMonthTrend(
  projects: Project[] = PROJECTS,
  months = TREND_MONTHS,
): { label: string; value: number }[] {
  // Tally by calendar month, keyed "YYYY-MM" straight off the ISO date.
  const counts = new Map<string, number>();
  for (const p of projects) {
    const key = (p.publicationDate ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Walk back from the current UTC month (matching the rest of the app's date
  // math), then reverse into chronological order.
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-11
  const window: { year: number; month: number; key: string }[] = [];
  for (let i = 0; i < months; i++) {
    window.push({ year, month, key: `${year}-${String(month + 1).padStart(2, "0")}` });
    if (--month < 0) {
      month = 11;
      year -= 1;
    }
  }
  window.reverse();

  // Only disambiguate with a year when the window straddles one.
  const spansYears = window[0].year !== window[window.length - 1].year;
  return window.map((w) => ({
    label: spansYears ? `${MONTH_SHORT[w.month]} '${String(w.year).slice(2)}` : MONTH_SHORT[w.month],
    value: counts.get(w.key) ?? 0,
  }));
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

  // JSAN's target band: opportunities whose value falls in $1–10M.
  const inTarget = projects.filter(
    (p) =>
      p.budget != null && p.budget >= TARGET_MIN_BUDGET_USD && p.budget <= TARGET_MAX_BUDGET_USD,
  );

  return {
    totalProjects: projects.length,
    newToday: projects.filter((p) => daysLeft(p.publicationDate) === 0).length,
    closingSoon: projects.filter((p) => p.status === "Closing Soon").length,
    totalBudget: projects.reduce((s, p) => s + (p.budget ?? 0), 0),
    targetPipeline: inTarget.reduce((s, p) => s + (p.budget ?? 0), 0),
    targetCount: inTarget.length,
    // Top 12 rather than 8 — the portal is worldwide and the chart is the main
    // place the spread of countries is visible. countryCount reports the full
    // number, and the Explorer's country filter lists every one of them.
    byCountry: tally(projects, (p) => p.country).slice(0, 12),
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
    highFitCount: projects.filter((p) => p.fitScore >= HIGH_FIT_THRESHOLD).length,
    countryCount: new Set(projects.map((p) => p.country)).size,
    organizationCount: new Set(projects.map((p) => p.organization)).size,
    byOrganization: tally(projects, (p) => p.organization).slice(0, 10),
    perMonth: perMonthTrend(projects),
    // Same window as perMonth so the two series line up on the x-axis.
    highFitPerMonth: perMonthTrend(
      projects.filter((p) => p.fitScore >= HIGH_FIT_THRESHOLD),
    ),
  };
}

// -------- facet helpers for filter dropdowns --------
// Every facet is derived from the data, so the filters describe exactly what is
// there. `countries` is intentionally uncapped: the portal is worldwide and the
// country dropdown is now the only way location narrows results.
export function facets(projects: Project[] = PROJECTS) {
  const uniq = (arr: string[]) => [...new Set(arr)].sort();
  return {
    countries: uniq(projects.map((p) => p.country)),
    states: uniq(projects.map((p) => p.state).filter(Boolean)),
    categories: uniq(projects.map((p) => p.category)),
    serviceLines: uniq(projects.map((p) => p.serviceLine)),
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
