import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "var(--primary)",
  delta,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: string;
  delta?: number;
  hint?: string;
}) {
  return (
    <div className="card p-5 animate-in">
      <div className="flex items-start justify-between">
        <span
          className="grid place-items-center w-10 h-10 rounded-xl"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
        >
          <Icon size={20} />
        </span>
        {delta != null && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
              delta >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
        <div className="text-[13px] text-text-muted mt-0.5">{label}</div>
        {hint && <div className="text-[11px] text-text-faint mt-1">{hint}</div>}
      </div>
    </div>
  );
}
