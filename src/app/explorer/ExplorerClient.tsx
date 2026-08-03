"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X, LayoutGrid, Rows3 } from "lucide-react";
import type { Project } from "@/lib/types";
import { TARGET_MAX_BUDGET_USD, HIGH_FIT_THRESHOLD, TARGET_SERVICE_LINES } from "@/lib/domain";
import { allCountryOptions } from "@/lib/countries";
import { ProjectCard } from "@/components/ProjectCard";
import { Pagination, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import { Breadcrumbs, EmptyState, StatusBadge, FitBadge } from "@/components/ui";
import { money, deadlineLabel } from "@/lib/format";
import Link from "next/link";

interface Facets {
  countries: string[];
  states: string[];
  categories: string[];
  serviceLines: string[];
  projectTypes: string[];
  statuses: string[];
  sources: string[];
  organizations: string[];
  technologies: string[];
  industries: string[];
  countryCounts: Record<string, number>;
  serviceLineCounts: Record<string, number>;
}

interface Paged {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Quick filters for the service lines the portal carries (see lib/domain).
// General software technologies were removed along with the software-development
// scope; any technology still present in the data stays reachable through the
// Technology dropdown in the filter panel.
const TECH_QUICK = [
  "GIS", "5G", "Fiber Optics", "Network Planning", "OSS/BSS", "RF Planning",
  "Earth Observation", "IoT", "Digital Twin", "SCADA",
];

// No location-preference sort: ranking by where JSAN has an office buried every
// other country on the back pages. Narrow by location with the Country filter,
// which lists every country present in the data.
const SORTS = [
  { value: "fitScore", label: "Capability fit (best)" },
  { value: "deadline", label: "Deadline (soonest)" },
  { value: "budget", label: "Budget (highest)" },
  { value: "publicationDate", label: "Newest published" },
];

const DEFAULT_SORT = "fitScore";

// JSAN's six capability focus areas, in priority order, with the signals each
// one captures. These are the ServiceLine values themselves, so selecting one
// filters on exactly what the classifier assigned — no second vocabulary to
// drift out of step with lib/ingest/normalize.ts.
const FOCUS_AREAS: { line: string; short: string; signals: string }[] = [
  {
    line: "Geospatial Intelligence",
    short: "Geospatial Intelligence",
    signals: "GIS, geospatial, mapping, LiDAR, photogrammetry, remote sensing, cadastral, land registry, spatial data",
  },
  {
    line: "Telecom & Network Engineering",
    short: "Telecom & Network",
    signals: "FTTx, fiber, broadband, 5G, network engineering, telecom GIS, fielding, survey, permits, closeout",
  },
  {
    line: "Geospatial & Telecom Adjacent",
    short: "Geospatial / Telecom Adjacent",
    signals: "Digital twin, IoT, SCADA, drone, satellite imagery, smart city, national digital infrastructure, sensor networks",
  },
  {
    line: "Digital Engineering",
    short: "Digital Engineering",
    signals: "Cloud migration, data engineering, web/mobile platforms, enterprise software and security linked to JSAN delivery capability",
  },
  {
    line: "Strategic Workforce Solutions",
    short: "Strategic Workforce",
    signals: "Staffing, resourcing, managed service, specialist delivery capacity",
  },
  {
    line: "Structured Program Management",
    short: "Structured Programme Mgmt",
    signals: "PMO, governance, delivery assurance, quality controls, multi-country execution management",
  },
];

// Deadline windows and fit bands offered in the filter panel. Both write a
// plain number into the query string, which the API and repository already
// understand (maxDeadlineDays / minFit).
const DEADLINE_WINDOWS = [
  { value: "7", label: "Within 7 days" },
  { value: "14", label: "Within 14 days" },
  { value: "30", label: "Within 30 days" },
  { value: "90", label: "Within 90 days" },
];

const FIT_BANDS = [
  { value: "50", label: "50 and above" },
  { value: String(HIGH_FIT_THRESHOLD), label: `${HIGH_FIT_THRESHOLD} and above (high fit)` },
  { value: "85", label: "85 and above" },
];

// The full Explorer state, and the value each key omits from the address bar.
// Reading and writing both go through this map, so a filter can never be
// written into a shareable URL without being read back out of one.
const URL_DEFAULTS = {
  q: "",
  country: "",
  state: "",
  category: "",
  serviceLine: "",
  technology: "",
  projectType: "",
  status: "",
  organization: "",
  source: "",
  minBudget: "",
  maxBudget: "",
  minFit: "",
  maxDeadlineDays: "",
  availableOnly: true, // hide occupied by default
  includeLarge: false, // hide >$10M by default
  sort: DEFAULT_SORT,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

type Filters = typeof URL_DEFAULTS;

/** Ignore an unrecognized ?sort= (e.g. an old bookmarked ?sort=priority link). */
function safeSort(value: string | null): string {
  return SORTS.some((s) => s.value === value) ? (value as string) : DEFAULT_SORT;
}

/** ?page=2 → 2; anything else (0, -1, "abc", absent) → 1. A page past the end
 *  is left alone: the API clamps it to the last page that exists and the
 *  reconciliation effect below adopts whatever came back. */
function safePage(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

/** Only the sizes the control offers, so ?pageSize=5000 cannot be linked in. */
function safePageSize(value: string | null): number {
  const n = Number(value);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/** Rebuild the Explorer state from a shared or bookmarked URL. */
function readFilters(sp: URLSearchParams | ReturnType<typeof useSearchParams>): Filters {
  const out = { ...URL_DEFAULTS };
  for (const key of Object.keys(URL_DEFAULTS) as (keyof Filters)[]) {
    const raw = sp.get(key);
    if (raw == null) continue;
    const fallback = URL_DEFAULTS[key];
    if (typeof fallback === "string") (out as Record<string, unknown>)[key] = raw;
    else if (typeof fallback === "boolean") (out as Record<string, unknown>)[key] = raw === "true";
  }
  // The three that need validating rather than accepting verbatim.
  out.sort = safeSort(sp.get("sort"));
  out.page = safePage(sp.get("page"));
  out.pageSize = safePageSize(sp.get("pageSize"));
  return out;
}

/** Select over fixed value/label pairs — for the numeric filters, where the
 *  stored value ("30") is not what should appear in the dropdown. */
function ChoiceSelect({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1.5 cursor-pointer"
      >
        <option value="">Any</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Select over a fixed catalogue, annotated with how many opportunities each
 * option currently holds.
 *
 * Used where the list should show the FULL set rather than only what the data
 * happens to contain — every country in the world, all six focus areas — so
 * coverage is visible even when a given entry is empty today. An option with
 * no rows stays selectable (it will simply return nothing, which is the honest
 * answer) but is marked so nobody picks it expecting results.
 */
function CatalogueSelect({
  label,
  value,
  options,
  counts,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  counts: Record<string, number>;
  onChange: (v: string) => void;
}) {
  const withData = options.filter((o) => (counts[o] ?? 0) > 0);
  const empty = options.filter((o) => (counts[o] ?? 0) === 0);
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {label}
        <span className="ml-1 normal-case text-text-faint/70">
          ({withData.length} of {options.length} with results)
        </span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1.5 cursor-pointer">
        <option value="">All</option>
        {withData.length > 0 && (
          <optgroup label="With opportunities">
            {withData.map((o) => (
              <option key={o} value={o}>
                {o} ({counts[o]})
              </option>
            ))}
          </optgroup>
        )}
        {empty.length > 0 && (
          <optgroup label="No opportunities yet">
            {empty.map((o) => (
              <option key={o} value={o}>
                {o} (0)
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  count,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Show how many options there are — used on Country to make the worldwide
   *  coverage visible rather than something you have to scroll to discover. */
  count?: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {label}
        {count != null && <span className="ml-1 normal-case text-text-faint/70">({count})</span>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1.5 cursor-pointer">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExplorerClient() {
  const searchParams = useSearchParams();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [data, setData] = useState<Paged | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(true);

  const [f, setF] = useState<Filters>(() => readFilters(searchParams));

  // Every change except an explicit page move returns to page 1 — the record at
  // position 300 of the old result set has nothing to do with the new one.
  const set = useCallback((patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, page: 1, ...patch }));
  }, []);

  const resultsRef = useRef<HTMLDivElement>(null);
  // Only a page move scrolls; a filter change must not yank the page around
  // while you are still working in the sidebar.
  const scrollOnNextData = useRef(false);

  const goToPage = useCallback((page: number) => {
    setF((prev) => {
      if (prev.page === page) return prev; // no move, no refetch, no scroll
      scrollOnNextData.current = true;
      return { ...prev, page };
    });
  }, []);

  // Paging is fast enough to click through faster than the responses arrive.
  // Only the newest request may write to state, so page 2's slower response
  // can never overwrite page 3's.
  const requestId = useRef(0);

  useEffect(() => {
    fetch("/api/facets")
      .then((r) => r.json())
      .then(setFacets);
  }, []);

  // Mirror the state into the address bar so a filtered page can be shared or
  // bookmarked and survives a reload. replaceState, not push: paging is not a
  // navigation, and stacking a history entry per page click would make Back
  // useless for leaving the Explorer.
  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      const s = String(v);
      if (s !== String(URL_DEFAULTS[k as keyof Filters])) qs.set(k, s);
    });
    const query = qs.toString();
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [f]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (k === "includeLarge") return; // not an API param — drives the soft cap below
      if (v !== "" && v != null) params.set(k, String(v));
    });
    // Default to the $1–10M target band; the toggle lifts the $10M ceiling
    // to reveal large (World Bank) global leads. A manual max budget still wins.
    if (!f.includeLarge) {
      const userMax = f.maxBudget ? Number(f.maxBudget) : Infinity;
      params.set("maxBudget", String(Math.min(userMax, TARGET_MAX_BUDGET_USD)));
    }
    const t = setTimeout(() => {
      const id = ++requestId.current;
      fetch(`/api/projects?${params.toString()}`)
        .then((r) => r.json())
        .then((d: Paged) => {
          if (id !== requestId.current) return; // superseded by a later page
          setData(d);
          setLoading(false);
          // The API clamps a page past the end to the last real one — adopt it,
          // otherwise the controls would keep claiming a page that isn't shown.
          if (typeof d.page === "number" && d.page !== f.page) {
            setF((prev) => ({ ...prev, page: d.page }));
          }
          if (scrollOnNextData.current) {
            scrollOnNextData.current = false;
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        })
        .catch(() => {
          // Leave the last good page on screen, but stop dimming it — a stuck
          // "busy" paginator reads as a hang rather than a failed request.
          if (id === requestId.current) setLoading(false);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [f]);

  const activeFilters = useMemo(
    () =>
      Object.entries(f).filter(
        ([k, v]) =>
          v !== "" &&
          typeof v === "string" &&
          !["q", "sort", "page", "minFit", "maxDeadlineDays"].includes(k),
      ) as [string, string][],
    [f],
  );

  // Keep the reading pace the user chose; only the filters reset.
  const clearAll = () => setF((prev) => ({ ...URL_DEFAULTS, pageSize: prev.pageSize }));

  return (
    <div className="space-y-5">
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Project Explorer" }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Project Explorer</h1>
            <p className="text-text-muted text-sm mt-1">
              {data ? `${data.total} opportunities` : "Loading…"} match your filters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`px-2.5 py-2 ${view === "grid" ? "bg-primary-soft text-primary" : "text-text-faint"}`}
                aria-label="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`px-2.5 py-2 ${view === "list" ? "bg-primary-soft text-primary" : "text-text-faint"}`}
                aria-label="List view"
              >
                <Rows3 size={16} />
              </button>
            </div>
            <button onClick={() => setShowFilters((v) => !v)} className="btn btn-ghost lg:hidden">
              <SlidersHorizontal size={16} /> Filters
            </button>
          </div>
        </div>
      </div>

      {/* Search + tech chips */}
      <div className="card p-4 space-y-3">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search by keyword, company, reference number, project ID…"
            className="input pl-9"
          />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-1.5">
            Capability focus areas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_AREAS.map((a) => {
              const active = f.serviceLine === a.line;
              return (
                <button
                  key={a.line}
                  onClick={() => set({ serviceLine: active ? "" : a.line })}
                  title={a.signals}
                  aria-pressed={active}
                  className={`chip transition-colors ${
                    active ? "!bg-primary !text-white !border-transparent" : "hover:!border-primary"
                  }`}
                >
                  {a.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TECH_QUICK.map((t) => (
            <button
              key={t}
              onClick={() => set({ technology: f.technology === t ? "" : t })}
              className={`chip transition-colors ${
                f.technology === t ? "!bg-primary !text-white !border-transparent" : "hover:!border-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Filters */}
        <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
          <div className="card p-4 space-y-4 lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <SlidersHorizontal size={15} /> Advanced Filters
              </h3>
              {activeFilters.length > 0 && (
                <button onClick={clearAll} className="text-[12px] text-primary font-semibold hover:underline">
                  Clear
                </button>
              )}
            </div>

            {facets && (
              <div className="space-y-3">
                <CatalogueSelect
                  label="Service Line"
                  value={f.serviceLine}
                  options={[...TARGET_SERVICE_LINES]}
                  counts={facets.serviceLineCounts}
                  onChange={(v) => set({ serviceLine: v })}
                />
                <CatalogueSelect
                  label="Country"
                  value={f.country}
                  options={allCountryOptions(facets.countries)}
                  counts={facets.countryCounts}
                  onChange={(v) => set({ country: v })}
                />
                <Select label="State / Region" value={f.state} options={facets.states} onChange={(v) => set({ state: v })} />
                <Select label="Category" value={f.category} options={facets.categories} onChange={(v) => set({ category: v })} />
                <Select label="Technology" value={f.technology} options={facets.technologies} onChange={(v) => set({ technology: v })} />
                <Select label="Project Type" value={f.projectType} options={facets.projectTypes} onChange={(v) => set({ projectType: v })} />
                <Select label="Status" value={f.status} options={facets.statuses} onChange={(v) => set({ status: v })} />
                <Select label="Organization" value={f.organization} options={facets.organizations} onChange={(v) => set({ organization: v })} />
                <Select label="Source" value={f.source} options={facets.sources} onChange={(v) => set({ source: v })} />
                <ChoiceSelect label="Deadline" value={f.maxDeadlineDays} choices={DEADLINE_WINDOWS} onChange={(v) => set({ maxDeadlineDays: v })} />
                <ChoiceSelect label="Fit Score" value={f.minFit} choices={FIT_BANDS} onChange={(v) => set({ minFit: v })} />

                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                    Budget range (USD)
                  </span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      type="number"
                      placeholder="Min"
                      value={f.minBudget}
                      onChange={(e) => set({ minBudget: e.target.value })}
                      className="input"
                    />
                    <span className="text-text-faint">–</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={f.maxBudget}
                      onChange={(e) => set({ maxBudget: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Results — scroll-mt clears the sticky topbar when paging jumps here */}
        <div ref={resultsRef} className="min-w-0 scroll-mt-24">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map(([k, v]) => (
                <span key={k} className="chip !bg-primary-soft !text-primary !border-transparent">
                  {v}
                  <button onClick={() => set({ [k]: "" } as any)} aria-label={`Remove ${k}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={f.availableOnly}
                onClick={() => set({ availableOnly: !f.availableOnly })}
                className="flex items-center gap-2 text-[13px]"
                title="Hide opportunities that are already awarded or closed"
              >
                <span
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    f.availableOnly ? "bg-primary" : "bg-border-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      f.availableOnly ? "translate-x-4" : ""
                    }`}
                  />
                </span>
                <span className="text-text-muted whitespace-nowrap">Hide occupied</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={f.includeLarge}
                onClick={() => set({ includeLarge: !f.includeLarge })}
                className="flex items-center gap-2 text-[13px]"
                title="By default only $1–10M opportunities (the target range) are shown. Turn on to also include large >$10M global leads (e.g. World Bank programs)."
              >
                <span
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    f.includeLarge ? "bg-primary" : "bg-border-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      f.includeLarge ? "translate-x-4" : ""
                    }`}
                  />
                </span>
                <span className="text-text-muted whitespace-nowrap">Include large (&gt;$10M)</span>
              </button>
              <label className="flex items-center gap-2 text-[13px]">
                <span className="text-text-faint">Sort</span>
                <select
                  value={f.sort}
                  onChange={(e) => set({ sort: e.target.value })}
                  className="input !w-auto !py-1.5 cursor-pointer"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading && !data ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card p-5 h-56 animate-pulse bg-bg-subtle" />
              ))}
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="card">
              <EmptyState title="No opportunities found" hint="Try widening your filters or clearing the search." />
            </div>
          ) : (
            <>
              {view === "grid" ? (
                <div className={`grid sm:grid-cols-2 xl:grid-cols-3 gap-4 ${loading ? "opacity-60" : ""}`}>
                  {data?.items.map((p) => (
                    <ProjectCard
                      key={p.id}
                      p={p}
                      highlight={{ technology: f.technology, category: f.category, q: f.q }}
                    />
                  ))}
                </div>
              ) : (
                <div className={`card overflow-hidden ${loading ? "opacity-60" : ""}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                          <th className="px-4 py-3 font-semibold">Project</th>
                          <th className="px-4 py-3 font-semibold">Organization</th>
                          <th className="px-4 py-3 font-semibold">Country</th>
                          <th className="px-4 py-3 font-semibold">Budget</th>
                          <th className="px-4 py-3 font-semibold">Deadline</th>
                          <th className="px-4 py-3 font-semibold">Fit Score</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.items.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-0 hover:bg-bg-subtle transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                                {p.title}
                              </Link>
                              <div className="text-[11px] text-text-faint">{p.referenceNumber}</div>
                            </td>
                            <td className="px-4 py-3 text-text-muted">{p.organization}</td>
                            <td className="px-4 py-3 text-text-muted">{p.country}</td>
                            <td className="px-4 py-3 font-semibold tabular-nums">{money(p.budget)}</td>
                            <td className="px-4 py-3 text-text-muted">{deadlineLabel(p.deadline)}</td>
                            <td className="px-4 py-3">
                              <FitBadge score={p.fitScore} />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={p.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data && (
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  totalPages={data.totalPages}
                  onPageChange={goToPage}
                  onPageSizeChange={(pageSize) => set({ pageSize })}
                  itemLabel="opportunities"
                  busy={loading}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
