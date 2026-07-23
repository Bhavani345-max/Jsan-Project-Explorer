export function money(n: number | null): string {
  if (n == null) return "Undisclosed";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const REF_NOW = new Date("2026-07-22T00:00:00Z");

export function daysLeft(iso: string): number {
  if (!iso) return Number.NaN; // no deadline listed
  return Math.round((new Date(iso).getTime() - REF_NOW.getTime()) / 86_400_000);
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
  const mins = Math.round((Date.parse(iso) - REF_NOW.getTime()) / 60000);
  const abs = Math.abs(mins);
  if (abs < 60) return `${abs}m ago`;
  if (abs < 1440) return `${Math.round(abs / 60)}h ago`;
  return `${Math.round(abs / 1440)}d ago`;
}
