// ------------------------------------------------------------------
// The "new opportunities" feed behind the topbar bell (server-only).
//
// There is deliberately no notifications table and nothing to write. A
// notification here IS an opportunity that recently entered the portal, so the
// feed is derived on read from `opportunities.ingested_at` — the column the
// ingest cron already sets and never overwrites. That means the daily cron
// needs no change to keep this current, there is no second copy of a project's
// title to drift out of date, and nothing to backfill.
//
// Read/unread is not stored either: every signed-in user sees the same feed, so
// the client keeps a "last seen" watermark and counts what arrived after it
// (see components/Notifications.tsx). No per-user rows, no writes on a read
// path.
// ------------------------------------------------------------------
import type { Project, ProjectStatus } from "@/lib/types";
import { loadRecentOpportunities } from "@/lib/db";
import { liveDataset } from "@/lib/live";
import { HIGH_FIT_THRESHOLD } from "@/lib/domain";
import { projectMoney } from "@/lib/format";

export interface OpportunityNotification {
  /** Project id — the panel links straight to /projects/<id>. */
  id: string;
  title: string;
  organization: string;
  country: string;
  budgetLabel: string;
  fitScore: number;
  /** True at or above HIGH_FIT_THRESHOLD, so the panel can lead with the ones
   *  actually worth a bid team's attention without re-deriving the rule. */
  highFit: boolean;
  status: ProjectStatus;
  deadline: string;
  /** When this became visible in the portal — an ISO timestamp for ingested
   *  rows, an ISO date for the seed. The client renders it as "3h ago" and
   *  compares it against its watermark, so both forms are parseable instants. */
  at: string;
}

/** Newest first, on whichever timestamp the record actually carries. */
function newestFirst(a: Project, b: Project): number {
  return whenSeen(b) - whenSeen(a);
}

function whenSeen(p: Project): number {
  const t = Date.parse(p.ingestedAt || p.publicationDate);
  return Number.isNaN(t) ? 0 : t;
}

function toNotification(p: Project): OpportunityNotification {
  return {
    id: p.id,
    title: p.title,
    organization: p.organization,
    country: p.country,
    budgetLabel: projectMoney(p),
    fitScore: p.fitScore,
    highFit: p.fitScore >= HIGH_FIT_THRESHOLD,
    status: p.status,
    deadline: p.deadline,
    at: p.ingestedAt || p.publicationDate,
  };
}

export interface NotificationFeed {
  items: OpportunityNotification[];
  /** False when these came from the bundled sample rather than real ingestion,
   *  so the panel can say so instead of implying live tenders just arrived. */
  live: boolean;
}

/**
 * The newest opportunities, live when the database has any and the seed
 * otherwise — the same degrade-to-seed contract as every other read.
 *
 * The seed path sorts by publication date because seed records were never
 * ingested and so carry no first-seen timestamp.
 */
export async function newOpportunities(limit = 20): Promise<NotificationFeed> {
  const recent = await loadRecentOpportunities(limit);
  if (recent?.length) {
    return { items: recent.map(toNotification), live: true };
  }
  const { projects } = await liveDataset();
  return {
    items: [...projects].sort(newestFirst).slice(0, limit).map(toNotification),
    live: false,
  };
}
