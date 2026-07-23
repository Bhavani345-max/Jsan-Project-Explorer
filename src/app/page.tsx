import Link from "next/link";
import { FolderKanban, Sparkles, AlarmClock, Wallet, ArrowRight, Target, Globe2, RadioTower } from "lucide-react";
import { dashboardStats, queryProjects } from "@/lib/repository";
import { StatCard } from "@/components/StatCard";
import { SectionCard, Breadcrumbs, StatusBadge, FitBadge, PresenceBadge } from "@/components/ui";
import { VBarChart, DonutChart, HBarChart, TrendArea } from "@/components/charts";
import { money, deadlineLabel, relTime, fmtDate } from "@/lib/format";

export default function DashboardPage() {
  const stats = dashboardStats();
  const recent = queryProjects({ sort: "publicationDate", pageSize: 6 }).items;
  const closing = queryProjects({ status: "Closing Soon", sort: "deadline", pageSize: 5 }).items;
  const bestFit = queryProjects({ sort: "priority", pageSize: 5 }).items;

  const lineCount = (label: string) => stats.byServiceLine.find((s) => s.label === label)?.value ?? 0;
  const gisCount = lineCount("Geospatial Intelligence");
  const telecomCount = lineCount("Telecom & Network Engineering");

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Dashboard" }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Opportunity Dashboard</h1>
            <p className="text-text-muted text-sm mt-1">
              GIS and telecom opportunities — plus adjacent digital engineering, workforce, and
              program-management work — discovered from public sources.
            </p>
          </div>
          <Link href="/explorer" className="btn btn-primary">
            Open Project Explorer <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Core-business shortcuts */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2">
          Core service lines · quick access
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/explorer?serviceLine=Geospatial%20Intelligence&sort=fitScore"
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
                {gisCount} open · GIS platforms, spatial analytics, field survey
              </div>
            </div>
            <ArrowRight size={18} className="text-text-faint shrink-0 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
          </Link>

          <Link
            href="/explorer?serviceLine=Telecom%20%26%20Network%20Engineering&sort=fitScore"
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
                {telecomCount} open · fibre/OSP, 5G &amp; RF planning, OSS/BSS
              </div>
            </div>
            <ArrowRight size={18} className="text-text-faint shrink-0 group-hover:translate-x-0.5 transition-all" />
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Opportunities" value={String(stats.totalProjects)} icon={FolderKanban} delta={8} hint="Across 6 active connectors" />
        <StatCard label="Best-Fit for JSAN" value={String(stats.highFitCount)} icon={Target} accent="var(--success)" delta={12} hint="Capability fit ≥ 85%" />
        <StatCard label="Closing Soon" value={String(stats.closingSoon)} icon={AlarmClock} accent="var(--warning)" delta={-3} hint="Deadline within 7 days" />
        <StatCard label="Pipeline Value" value={money(stats.totalBudget)} icon={Wallet} accent="var(--accent)" delta={15} hint="Sum of disclosed budgets" />
      </div>

      {/* JSAN service-line focus */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Opportunities by JSAN Service Line" subtitle="Mapped to our four pillars">
          <DonutChart data={stats.byServiceLine} />
        </SectionCard>
        <SectionCard
          title="Priority Opportunities for JSAN"
          subtitle="Ranked by location footprint, then capability fit"
          className="lg:col-span-2"
          action={
            <Link href="/explorer?sort=priority" className="text-[13px] font-semibold text-primary hover:underline">
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{p.title}</p>
                    <PresenceBadge tier={p.presenceTier} label={p.presenceLabel} />
                  </div>
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
