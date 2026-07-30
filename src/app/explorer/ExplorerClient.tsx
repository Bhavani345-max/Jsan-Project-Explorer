"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X, LayoutGrid, Rows3 } from "lucide-react";
import type { Project } from "@/lib/types";
import { TARGET_MAX_BUDGET_USD } from "@/lib/domain";
import { ProjectCard } from "@/components/ProjectCard";
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

/** Ignore an unrecognized ?sort= (e.g. an old bookmarked ?sort=priority link). */
function safeSort(value: string | null): string {
  return SORTS.some((s) => s.value === value) ? (value as string) : DEFAULT_SORT;
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

  const [f, setF] = useState({
    q: searchParams.get("q") ?? "",
    country: "",
    state: "",
    category: searchParams.get("category") ?? "",
    serviceLine: searchParams.get("serviceLine") ?? "",
    technology: searchParams.get("technology") ?? "",
    projectType: "",
    status: "",
    organization: "",
    source: "",
    minBudget: "",
    maxBudget: "",
    minFit: searchParams.get("minFit") ?? "",
    availableOnly: searchParams.get("availableOnly") !== "false", // hide occupied by default
    includeLarge: searchParams.get("includeLarge") === "true", // hide >$10M by default
    sort: safeSort(searchParams.get("sort")),
    page: 1,
  });

  const set = useCallback((patch: Partial<typeof f>) => {
    setF((prev) => ({ ...prev, page: 1, ...patch }));
  }, []);

  useEffect(() => {
    fetch("/api/facets")
      .then((r) => r.json())
      .then(setFacets);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (k === "includeLarge") return; // not an API param — drives the soft cap below
      if (v !== "" && v != null) params.set(k, String(v));
    });
    // Default to JSAN's $1–10M target band; the toggle lifts the $10M ceiling
    // to reveal large (World Bank) global leads. A manual max budget still wins.
    if (!f.includeLarge) {
      const userMax = f.maxBudget ? Number(f.maxBudget) : Infinity;
      params.set("maxBudget", String(Math.min(userMax, TARGET_MAX_BUDGET_USD)));
    }
    params.set("pageSize", "9");
    const t = setTimeout(() => {
      fetch(`/api/projects?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLoading(false);
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
          !["q", "sort", "page", "minFit"].includes(k),
      ) as [string, string][],
    [f],
  );

  const clearAll = () =>
    setF({
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
      availableOnly: true,
      includeLarge: false,
      sort: DEFAULT_SORT,
      page: 1,
    });

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
                <Select label="JSAN Service Line" value={f.serviceLine} options={facets.serviceLines} onChange={(v) => set({ serviceLine: v })} />
                <Select label="Country" value={f.country} options={facets.countries} onChange={(v) => set({ country: v })} count={facets.countries.length} />
                <Select label="State / Region" value={f.state} options={facets.states} onChange={(v) => set({ state: v })} />
                <Select label="Category" value={f.category} options={facets.categories} onChange={(v) => set({ category: v })} />
                <Select label="Technology" value={f.technology} options={facets.technologies} onChange={(v) => set({ technology: v })} />
                <Select label="Project Type" value={f.projectType} options={facets.projectTypes} onChange={(v) => set({ projectType: v })} />
                <Select label="Status" value={f.status} options={facets.statuses} onChange={(v) => set({ status: v })} />
                <Select label="Organization" value={f.organization} options={facets.organizations} onChange={(v) => set({ organization: v })} />
                <Select label="Source" value={f.source} options={facets.sources} onChange={(v) => set({ source: v })} />

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

        {/* Results */}
        <div className="min-w-0">
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
                title="By default only $1–10M opportunities (JSAN's target range) are shown. Turn on to also include large >$10M global leads (e.g. World Bank programs)."
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
                          <th className="px-4 py-3 font-semibold">JSAN Fit</th>
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

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-5">
                  <span className="text-[13px] text-text-faint">
                    Page {data.page} of {data.totalPages} · {data.total} results
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={data.page <= 1}
                      onClick={() => setF((p) => ({ ...p, page: p.page - 1 }))}
                      className="btn btn-ghost disabled:opacity-40"
                    >
                      Previous
                    </button>
                    {Array.from({ length: data.totalPages }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setF((p) => ({ ...p, page: i + 1 }))}
                        className={`w-9 h-9 rounded-lg text-sm font-semibold ${
                          data.page === i + 1 ? "bg-primary text-white" : "text-text-muted hover:bg-bg-subtle"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      disabled={data.page >= data.totalPages}
                      onClick={() => setF((p) => ({ ...p, page: p.page + 1 }))}
                      className="btn btn-ghost disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
