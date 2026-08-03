import Link from "next/link";
import type { ProjectStatus } from "@/lib/types";
import { HIGH_FIT_THRESHOLD } from "@/lib/domain";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, { bg: string; text: string; label: string }> = {
    Open: { bg: "var(--success-soft)", text: "var(--success)", label: "Open" },
    "Closing Soon": { bg: "var(--warning-soft)", text: "var(--warning)", label: "Closing Soon" },
    Closed: { bg: "var(--danger-soft)", text: "var(--danger)", label: "Closed" },
    Awarded: { bg: "var(--primary-soft)", text: "var(--primary)", label: "Awarded" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.text }} />
      {s.label}
    </span>
  );
}

export function TechChip({ label }: { label: string }) {
  return <span className="chip">{label}</span>;
}

/** Capability-fit badge — green at or above the high-fit threshold, amber
 *  within 15 points of it, neutral below. */
export function FitBadge({ score, showLabel = false }: { score: number; showLabel?: boolean }) {
  const tone =
    score >= HIGH_FIT_THRESHOLD
      ? { bg: "var(--success-soft)", text: "var(--success)" }
      : score >= HIGH_FIT_THRESHOLD - 15
        ? { bg: "var(--warning-soft)", text: "var(--warning)" }
        : { bg: "var(--bg-subtle)", text: "var(--text-muted)" };
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: tone.bg, color: tone.text }}
      title={`Capability fit: ${score}%`}
    >
      {score}%{showLabel ? " fit" : ""}
    </span>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && <h3 className="font-semibold text-[15px]">{title}</h3>}
            {subtitle && <p className="text-xs text-text-faint mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px] text-text-faint mb-4 flex-wrap">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {it.href ? (
            <Link href={it.href} className="hover:text-primary transition-colors">
              {it.label}
            </Link>
          ) : (
            <span className="text-text-muted font-medium">{it.label}</span>
          )}
          {i < items.length - 1 && <span className="text-border-strong">/</span>}
        </span>
      ))}
    </nav>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">🔍</div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-text-faint mt-1">{hint}</p>}
    </div>
  );
}
