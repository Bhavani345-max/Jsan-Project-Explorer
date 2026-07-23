import { TrendingUp, Trophy, Target, Percent, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { dashboardStats } from "@/lib/repository";
import { PROJECTS } from "@/lib/seed";
import { StatCard } from "@/components/StatCard";
import { Breadcrumbs, SectionCard } from "@/components/ui";
import { TrendArea, VBarChart, HBarChart, DonutChart } from "@/components/charts";

export default function AnalyticsPage() {
  const stats = dashboardStats();

  const orgTally = new Map<string, number>();
  for (const p of PROJECTS) orgTally.set(p.organization, (orgTally.get(p.organization) ?? 0) + 1);
  const topOrgs = [...orgTally.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const won = 7;
  const pursued = 19;
  const successRate = Math.round((won / pursued) * 100);
  const trendingTech = stats.byTechnology.slice(0, 6).map((t, i) => ({
    ...t,
    delta: [18, 12, 9, -4, 6, 3][i] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Analytics" }]} />
        <h1 className="text-2xl font-bold tracking-tight">Analytics & Insights</h1>
        <p className="text-text-muted text-sm mt-1">Pipeline performance, trends, and technology demand.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Opportunities Pursued" value={String(pursued)} icon={Target} delta={11} />
        <StatCard label="Projects Won" value={String(won)} icon={Trophy} accent="var(--success)" delta={2} />
        <StatCard label="Success Rate" value={`${successRate}%`} icon={Percent} accent="var(--accent)" delta={5} />
        <StatCard label="Trending Techs" value={String(trendingTech.length)} icon={TrendingUp} accent="var(--warning)" hint="Demand rising this quarter" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Projects per Month" subtitle="Ingestion & discovery trend" className="lg:col-span-2">
          <TrendArea data={stats.perMonth} height={280} />
        </SectionCard>
        <SectionCard title="Win / Loss Split" subtitle="Closed pursuits">
          <DonutChart
            data={[
              { label: "Won", value: won },
              { label: "Lost", value: pursued - won },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Projects by Country">
          <VBarChart data={stats.byCountry} height={300} />
        </SectionCard>
        <SectionCard title="Projects by Technology">
          <HBarChart data={stats.byTechnology} height={300} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Trending Technologies" subtitle="Quarter-over-quarter demand change">
          <div className="space-y-2.5">
            {trendingTech.map((t, i) => (
              <div key={t.label} className="flex items-center gap-3">
                <span className="w-6 text-center text-[13px] font-bold text-text-faint tabular-nums">{i + 1}</span>
                <span className="font-medium text-sm w-32 shrink-0">{t.label}</span>
                <div className="flex-1 h-2 rounded-full bg-bg-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(t.value / trendingTech[0].value) * 100}%` }}
                  />
                </div>
                <span className="text-[13px] tabular-nums w-8 text-right">{t.value}</span>
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-semibold w-14 justify-end ${
                    t.delta >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {t.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(t.delta)}%
                </span>
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
