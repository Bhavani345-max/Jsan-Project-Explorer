import Link from "next/link";
import { MapPin, Building2, CalendarClock, Wallet } from "lucide-react";
import type { Project } from "@/lib/types";
import { StatusBadge, FitBadge, PresenceBadge } from "./ui";
import { money, deadlineLabel, daysLeft } from "@/lib/format";

export function ProjectCard({ p }: { p: Project }) {
  const dl = daysLeft(p.deadline);
  return (
    <Link
      href={`/projects/${p.id}`}
      className="card p-5 flex flex-col gap-3 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="chip !bg-primary-soft !text-primary !border-transparent">{p.category}</span>
        <div className="flex items-center gap-1.5">
          <FitBadge score={p.fitScore} />
          <StatusBadge status={p.status} />
        </div>
      </div>

      <div>
        <h3 className="font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {p.title}
        </h3>
        <p className="text-[13px] text-text-muted mt-1.5 line-clamp-2">{p.summary}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <PresenceBadge tier={p.presenceTier} label={p.presenceLabel} />
        {p.technologies.slice(0, 3).map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
        {p.technologies.length > 3 && <span className="chip">+{p.technologies.length - 3}</span>}
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[12px] text-text-muted mt-1 pt-3 border-t border-border">
        <span className="flex items-center gap-1.5 truncate">
          <Building2 size={13} className="text-text-faint shrink-0" />
          <span className="truncate">{p.organization}</span>
        </span>
        <span className="flex items-center gap-1.5 truncate">
          <MapPin size={13} className="text-text-faint shrink-0" />
          {p.country}
        </span>
        <span className="flex items-center gap-1.5">
          <Wallet size={13} className="text-text-faint shrink-0" />
          <span className="font-semibold text-text">{money(p.budget)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock size={13} className="text-text-faint shrink-0" />
          <span className={dl >= 0 && dl <= 7 ? "text-warning font-semibold" : ""}>
            {deadlineLabel(p.deadline)}
          </span>
        </span>
      </div>
    </Link>
  );
}
