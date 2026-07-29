import { TrendingUp, Target } from "lucide-react";
import { dashboardStats } from "@/lib/repository";
import { liveDataset } from "@/lib/live";
import { StatCard } from "@/components/StatCard";
import { Breadcrumbs, SectionCard } from "@/components/ui";
import { TrendArea, VBarChart, HBarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { projects } = await liveDataset();
  const stats = dashboardStats(projects);

  const orgTally = new Map<string, number>();
  for (const p of projects) orgTally.set(p.organization, (orgTally.get(p.organization) ?? 0) + 1);
  const topOrgs = [...orgTally.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const highFit = projects.filter((p) => p.fitScore >= 70).length;
  const topTech = stats.byTechnology.slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Analytics" }]} />
        <h1 className="text-2xl font-bold tracking-tight">Analytics & Insights</h1>
        <p className="text-text-muted text-sm mt-1">Pipeline performance, trends, and technology demand.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="High-Fit Opportunities" value={String(highFit)} icon={Target} hint="Capability fit ≥ 70%" />
        <StatCard label="Technologies Tracked" value={String(stats.byTechnology.length)} icon={TrendingUp} accent="var(--warning)" hint="Distinct technologies across open opportunities" />
      </div>

      <SectionCard title="Projects per Month" subtitle="Ingestion & discovery trend">
        <TrendArea data={stats.perMonth} height={280} />
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Projects by Country">
          <VBarChart data={stats.byCountry} height={300} />
        </SectionCard>
        <SectionCard title="Projects by Technology">
          <HBarChart data={stats.byTechnology} height={300} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Top Technologies in Demand" subtitle="Most requested across open opportunities">
          <div className="space-y-2.5">
            {topTech.map((t, i) => (
              <div key={t.label} className="flex items-center gap-3">
                <span className="w-6 text-center text-[13px] font-bold text-text-faint tabular-nums">{i + 1}</span>
                <span className="font-medium text-sm w-32 shrink-0">{t.label}</span>
                <div className="flex-1 h-2 rounded-full bg-bg-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(t.value / topTech[0].value) * 100}%` }}
                  />
                </div>
                <span className="text-[13px] tabular-nums w-8 text-right">{t.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top Organizations" subtitle="Most active opportunity publishers">
          <div className="space-y-2.5">
            {topOrgs.map((o, i) => (
              <div key={o.label} className="flex items-center gap-3">
                <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary-soft text-primary text-[11px] font-bold shrink-0">
                  {o.label.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="font-medium text-sm flex-1 truncate">{o.label}</span>
                <span className="chip">{o.value} projects</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
