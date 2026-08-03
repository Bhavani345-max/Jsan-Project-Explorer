import Link from "next/link";
import { FolderKanban, AlarmClock, Wallet, ArrowRight, Target, Globe2, RadioTower, Layers, Globe } from "lucide-react";
import { dashboardStats, queryProjects } from "@/lib/repository";
import { liveDataset } from "@/lib/live";
import { StatCard } from "@/components/StatCard";
import { SectionCard, Breadcrumbs, StatusBadge, FitBadge } from "@/components/ui";
import { VBarChart, DonutChart, HBarChart, TrendArea } from "@/components/charts";
import { money, deadlineLabel, relTime, fmtDate } from "@/lib/format";
import type { ProjectQuery, ServiceLine } from "@/lib/types";

export const dynamic = "force-dynamic";

// The count shown on a core service-line card and the Explorer link it opens are
// both derived from ONE filter object, so the card can never claim a number the
// results page then contradicts.
//
// `availableOnly` matches the Explorer's own default (awarded/closed hidden), and
// `includeLarge` lifts its $10M soft cap — queryProjects applies no ceiling here,
// so without that flag the card would over-count by however many >$10M leads exist.
function coreServiceLine(serviceLine: ServiceLine, projects: Parameters<typeof queryProjects>[1]) {
  const sort = "fitScore" as const;
  const query: ProjectQuery = { serviceLine, availableOnly: true, sort };
  const params = new URLSearchParams({
    serviceLine,
    availableOnly: String(query.availableOnly),
    includeLarge: "true",
    sort,
  });
  return {
    count: queryProjects({ ...query, pageSize: 1 }, projects).total,
    href: `/explorer?${params.toString()}`,
  };
}

export default async function DashboardPage() {
  const { projects } = await liveDataset();
  const stats = dashboardStats(projects);
  const recent = queryProjects({ sort: "publicationDate", pageSize: 6 }, projects).items;
  const closing = queryProjects({ status: "Closing Soon", sort: "deadline", pageSize: 5 }, projects).items;
  const bestFit = queryProjects({ sort: "fitScore", pageSize: 5 }, projects).items;

  const gis = coreServiceLine("Geospatial Intelligence", projects);
  const telecom = coreServiceLine("Telecom & Network Engineering", projects);
  const adjacent = coreServiceLine("Geospatial & Telecom Adjacent", projects);
  const sourceCount = new Set(projects.map((p) => p.source)).size;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Dashboard" }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Opportunity Dashboard</h1>
            <p className="text-text-muted text-sm mt-1">
              Geospatial, telecom and closely related engineering opportunities — discovered from
              public sources worldwide, in every country those sources report.
            </p>
          </div>
          <Link href="/explorer" className="btn btn-primary">
            Open Project Explorer <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Service-line shortcuts */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2">
          Service lines · quick access
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href={gis.href}
            className="card p-5 flex items-center gap-4 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all group"
          >
            <span
              className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
              style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" }}
            >
              <Globe2 size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Core · Geospatial</div>
              <div className="font-semibold text-[15px] mt-0.5 group-hover:text-primary transition-colors">GIS Opportunities</div>
              <div className="text-[12px] text-text-faint mt-0.5">
                {gis.count} open · GIS platforms, spatial analytics, field survey
              </div>
            </div>
            <ArrowRight size={18} className="text-text-faint shrink-0 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
          </Link>

          <Link
            href={telecom.href}
            className="card p-5 flex items-center gap-4 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all group"
          >
            <span
              className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
              style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}
            >
              <RadioTower size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Core · Telecom</div>
              <div className="font-semibold text-[15px] mt-0.5">Telecom Opportunities</div>
              <div className="text-[12px] text-text-faint mt-0.5">
                {telecom.count} open · fibre/OSP, 5G &amp; RF planning, OSS/BSS
              </div>
            </div>
            <ArrowRight size={18} className="text-text-faint shrink-0 group-hover:translate-x-0.5 transition-all" />
          </Link>

          <Link
            href={adjacent.href}
            className="card p-5 flex items-center gap-4 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all group"
          >
            <span
              className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
              style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}
            >
              <Layers size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Related</div>
              <div className="font-semibold text-[15px] mt-0.5">Adjacent Opportunities</div>
              <div className="text-[12px] text-text-faint mt-0.5">
                {adjacent.count} open · earth observation, digital twin, IoT, SCADA
              </div>
            </div>
            <ArrowRight size={18} className="text-text-faint shrink-0 group-hover:translate-x-0.5 transition-all" />
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* No period-over-period deltas: the portal holds only currently-open
            notices and keeps no historical snapshots, so there is nothing real to
            compare against. Every figure below is a straight count of the data. */}
        <StatCard label="Total Opportunities" value={String(stats.totalProjects)} icon={FolderKanban} hint={`Open, across ${sourceCount} public ${sourceCount === 1 ? "source" : "sources"}`} />
        <StatCard label="Countries Covered" value={String(stats.countryCount)} icon={Globe} accent="var(--accent)" hint="Every country the sources report" />
        <StatCard label="High-Fit Opportunities" value={String(stats.highFitCount)} icon={Target} accent="var(--success)" hint="Capability fit ≥ 85%" />
        <StatCard label="Closing Soon" value={String(stats.closingSoon)} icon={AlarmClock} accent="var(--warning)" hint="Deadline within 7 days" />
        <StatCard label="Target Pipeline ($1–10M)" value={money(stats.targetPipeline)} icon={Wallet} hint={`${stats.targetCount} opportunities in the target band`} />
      </div>

      {/* Service-line focus */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Opportunities by Service Line" subtitle="Share of the board by line">
          <DonutChart data={stats.byServiceLine} />
        </SectionCard>
        <SectionCard
          title="Best-Fit Opportunities"
          subtitle="Ranked by capability fit, then nearest deadline"
          className="lg:col-span-2"
          action={
            <Link href="/explorer?sort=fitScore" className="text-[13px] font-semibold text-primary hover:underline">
              View all
            </Link>
          }
        >
          <div className="divide-y divide-border -mx-1">
            {bestFit.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-3 px-1 py-2.5 hover:bg-bg-subtle rounded-lg transition-colors"
              >
                <FitBadge score={p.fitScore} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.title}</p>
                  <p className="text-[12px] text-text-faint truncate">
                    {p.serviceLine} · {p.organization} · {p.country}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-sm tabular-nums">{money(p.budget)}</div>
                  <div className="text-[11px] text-text-faint">{deadlineLabel(p.deadline)}</div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Opportunities Collected" subtitle="Monthly ingestion trend" className="lg:col-span-2">
          <TrendArea data={stats.perMonth} />
        </SectionCard>
        <SectionCard title="Opportunities by Category" subtitle="Delivery mix">
          <DonutChart data={stats.byCategory} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Projects by Country">
          <VBarChart data={stats.byCountry} />
        </SectionCard>
        <SectionCard title="Top Technologies">
          <HBarChart data={stats.byTechnology} />
        </SectionCard>
        <SectionCard title="Projects by Budget Band">
          <VBarChart data={stats.byBudget} color="#10b981" />
        </SectionCard>
      </div>

      {/* Recent + closing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Recent Opportunities"
          subtitle="Latest published across all sources"
          className="lg:col-span-2"
          action={
            <Link href="/explorer" className="text-[13px] font-semibold text-primary hover:underline">
              View all
            </Link>
          }
        >
          <div className="divide-y divide-border -mx-1">
            {recent.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-3 px-1 py-3 hover:bg-bg-subtle rounded-lg transition-colors -my-px"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="chip !text-[10px] !py-0.5">{p.category}</span>
                    <span className="text-[11px] text-text-faint">{p.source}</span>
                  </div>
                  <p className="font-medium text-sm mt-1 truncate">{p.title}</p>
                  <p className="text-[12px] text-text-faint truncate">
                    {p.organization} · {p.country}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-sm tabular-nums">{money(p.budget)}</div>
                  <div className="text-[11px] text-text-faint">{fmtDate(p.publicationDate)}</div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Closing Soon" subtitle="Act before the deadline">
          <div className="space-y-3">
            {closing.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block rounded-xl border border-border p-3 hover:border-warning transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-warning">{deadlineLabel(p.deadline)}</span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="font-medium text-sm mt-1.5 line-clamp-2">{p.title}</p>
                <p className="text-[12px] text-text-faint mt-1">{p.organization}</p>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Projects by Source" subtitle="Where opportunities originate">
          <HBarChart data={stats.bySource} height={260} />
        </SectionCard>
        <SectionCard title="Source Coverage" subtitle="Public channels only — no restricted scraping">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Government Procurement APIs", "SAM.gov, Contracts Finder, GeM"],
              ["Public Tender APIs", "MERX, TenderLink, Tender Board"],
              ["Open Data Portals", "TED Europa, data.gov"],
              ["RSS / XML Feeds", "AngelList, e-Procurement feeds"],
            ].map(([t, s]) => (
              <div key={t} className="rounded-xl bg-bg-subtle p-3.5">
                <p className="font-semibold text-[13px]">{t}</p>
                <p className="text-[11px] text-text-faint mt-1">{s}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
