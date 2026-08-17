import Link from "next/link";
import { MapPin, Building2, CalendarClock, Wallet } from "lucide-react";
import type { Project } from "@/lib/types";
import { StatusBadge, FitBadge } from "./ui";
import { projectMoney, deadlineLabel, daysLeft } from "@/lib/format";

// The active search context, so a card can lead with the exact thing the user
// searched for (e.g. a "GIS" technology) instead of always showing the project
// category (which might be "Telecom / Network").
export interface CardHighlight {
  technology?: string;
  category?: string;
  q?: string;
}

/** Which technology on this project matched what the user searched for. */
function matchedTechFor(p: Project, h?: CardHighlight): string | null {
  if (!h) return null;
  if (h.technology && p.technologies.includes(h.technology)) return h.technology;
  const term = h.q?.trim().toLowerCase();
  if (term) {
    const exact = p.technologies.find((t) => t.toLowerCase() === term);
    if (exact) return exact;
    const partial = p.technologies.find((t) => t.toLowerCase().includes(term));
    if (partial) return partial;
  }
  return null;
}

export function ProjectCard({ p, highlight }: { p: Project; highlight?: CardHighlight }) {
  const dl = daysLeft(p.deadline);
  const matchedTech = matchedTechFor(p, highlight);

  // Lead the card with what was searched. If a technology matched, that becomes
  // the headline chip and the category drops back to a secondary tag; otherwise
  // the category leads as before.
  const primaryLabel = matchedTech ?? p.category;
  const showCategoryTag = primaryLabel !== p.category;
  const orderedTech = matchedTech
    ? [matchedTech, ...p.technologies.filter((t) => t !== matchedTech)]
    : p.technologies;

  return (
    <Link
      href={`/projects/${p.id}`}
      className="card p-5 flex flex-col gap-3 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="chip !bg-primary-soft !text-primary !border-transparent">{primaryLabel}</span>
          {showCategoryTag && <span className="chip">{p.category}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
        {orderedTech.slice(0, 3).map((t) => (
          <span
            key={t}
            className={`chip ${t === matchedTech ? "!bg-primary !text-white !border-transparent" : ""}`}
          >
            {t}
          </span>
        ))}
        {orderedTech.length > 3 && <span className="chip">+{orderedTech.length - 3}</span>}
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
          <span className="font-semibold text-text">{projectMoney(p)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarClock size={13} className="text-text-faint shrink-0" />
          <span className={dl >= 0 && dl <= 7 ? "text-warning font-semibold" : ""}>
            {deadlineLabel(p.deadline)}
          </span>
        </span>
        <span className="col-span-2 flex items-center gap-1.5 text-[11px] text-text-faint truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <span className="truncate">Source: {p.source}</span>
        </span>
      </div>
    </Link>
  );
}
