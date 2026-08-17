export function money(n: number | null): string {
  if (n == null) return "Undisclosed";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/**
 * money() without a trailing ".0" — for threshold labels, where a round
 * boundary should read as one ("≥$15M", not "≥$15.0M"): the decimal implies a
 * precision the threshold does not have. Every label naming a policy boundary
 * goes through this, so the number on screen is always the constant itself and
 * cannot drift away from it.
 */
export function moneyRound(n: number | null): string {
  return money(n).replace(/\.0(?=[KMB]?$)/, "");
}

/**
 * The contract value as it may honestly be shown to a reader.
 *
 * Every list that prints a figure next to a notice goes through this rather
 * than money(p.budget) directly. `budget` carries UNDISCLOSED_BUDGET_USD when
 * the buyer published nothing, and that stand-in equals the primary line — so
 * money() alone renders two thirds of the board as a confident "$15.0M" and
 * gives the reader no way to tell a real contract from a blank field.
 *
 * The stand-in still does its job in sorting and banding; it just never gets
 * quoted back as money anyone committed to.
 */
export function projectMoney(p: { budget: number | null; budgetDisclosed: boolean }): string {
  return p.budgetDisclosed ? money(p.budget) : "Undisclosed";
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
