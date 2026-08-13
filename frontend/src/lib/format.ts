export function money(n: number | null): string {
  if (n == null) return "Undisclosed";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// All relative-date math is anchored to the real current time so live,
// day-by-day ingested data stays accurate. Day counts are measured from
// today's UTC midnight, which keeps a value stable for the whole day — the
// same on the server render and on client hydration.
export function todayUtcMs(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

export function daysLeft(iso: string): number {
  if (!iso) return Number.NaN; // no deadline listed
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.NaN;
  return Math.round((t - todayUtcMs()) / 86_400_000);
}

export function deadlineLabel(iso: string): string {
  const d = daysLeft(iso);
  if (Number.isNaN(d)) return "No deadline listed";
  if (d < 0) return "Closed";
  if (d === 0) return "Due today";
  if (d === 1) return "1 day left";
  return `${d} days left`;
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function relTime(iso: string): string {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  const abs = Math.abs(mins);
  if (abs < 60) return `${abs}m ago`;
  if (abs < 1440) return `${Math.round(abs / 60)}h ago`;
  return `${Math.round(abs / 1440)}d ago`;
}
