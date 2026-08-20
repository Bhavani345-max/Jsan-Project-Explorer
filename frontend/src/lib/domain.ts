// ------------------------------------------------------------------
// Target domain — the single source of truth for what this portal is for.
//
// JSAN pursues geospatial and telecom/network engineering work, plus work in
// the same field that isn't a pure GIS or telecom contract (see the "adjacent"
// line below). Everything else a public procurement feed carries — generic
// software development, health, education, finance, agriculture, energy,
// construction — is out of scope.
//
// The scope is geographic-neutral by design: it says nothing about *where* an
// opportunity is. Every country a source reports is carried, and the country
// filter in the Explorer lists all of them.
//
// The filter is applied in two places and NEVER deletes anything:
//   · at ingest — out-of-domain notices are not persisted, so the store
//                 stops accumulating noise from here on;
//   · at read   — rows already stored simply stop surfacing.
//
// Records collected before this filter existed are retained in full. They
// are hidden, not erased, and become visible again by widening this list —
// then promoted into view with /api/cron/reclassify.
// ------------------------------------------------------------------
import type { Project, ProjectCategory, ServiceLine } from "@/lib/types";

/**
 * The service lines the portal surfaces — JSAN's capability focus areas.
 *
 * Every line listed is carried. The portal previously surfaced only the three
 * geospatial/telecom lines and hid the rest, which meant staffing, PMO and
 * digital-engineering opportunities were ingested and then never shown.
 *
 * "Utility Network Intelligence" is the newest line: the connected operating
 * model JSAN delivers to electrical, water and gas distribution utilities.
 * Adding it changed no stored record — measured over the 763 rows held when it
 * was introduced, the classifier claimed none of them, because this work was
 * not reaching the portal at all. See lib/ingest/utility.ts.
 *
 * The three autonomous-mobility lines are the newest addition — the capability
 * architecture stated on slide 2 of JSAN_Autonomous_Mobility_Services.pptx.
 * They are the same shape of addition Utility Network Intelligence was: work
 * JSAN sells today that the portal was not watching for at all, so no stored
 * record changes line merely by their existence. What DOES move is a notice the
 * autonomy classifier claims from an existing line — run the reclassify job in
 * dry-run first and read the `changes` list before applying it.
 *
 * Widening this list is only safe because `categorize()` no longer falls
 * through into a target line: an unmatched notice becomes "Unclassified" →
 * "Out of Scope" and stays hidden. Without that change every agriculture and
 * health tender in the feed would appear here as Digital Engineering.
 */
export const TARGET_SERVICE_LINES: ServiceLine[] = [
  "Geospatial Intelligence",
  "Telecom & Network Engineering",
  "Utility Network Intelligence",
  "Geospatial & Telecom Adjacent",
  "Autonomous Data Engineering",
  "Geospatial & Perception Intelligence",
  "Validation & Managed Operations",
  "Digital Engineering",
  "Strategic Workforce Solutions",
  "Structured Program Management",
];

/** Delivery categories that map into the target service lines. */
export const TARGET_CATEGORIES: ProjectCategory[] = [
  "GIS",
  "Telecom / Network",
  "Utility Network GIS",
  "Geospatial / Telecom Adjacent",
  "Autonomous Vehicle Data",
  "Perception & Road Intelligence",
  "Validation & QA Operations",
  "Cloud Migration",
  "Data Engineering",
  "Web Development",
  "Mobile Development",
  "Enterprise Software",
  "Cyber Security",
  "DevOps",
  "AI/ML",
  "Workforce Solutions",
  "Program Management",
];

/** The two lines that are JSAN's core business, as opposed to adjacent work. */
export const CORE_SERVICE_LINES: ServiceLine[] = [
  "Geospatial Intelligence",
  "Telecom & Network Engineering",
];

// ---- contract value policy -----------------------------------------
// Two numbers decide how an opportunity's value is treated, and every screen
// reads them from here — the ingest floor (normalize), the purge floor and the
// read query (db), the Explorer's ranking and its primary lens, and the
// dashboard's pipeline KPI. When these drift apart the same notice is counted
// one way on the dashboard and another in the Explorer.
//
//   · MIN_BUDGET_USD     — the collection floor. A notice that DISCLOSES a
//                          value below it is not collected and not surfaced.
//                          Deliberately never rendered: it is an internal
//                          collection rule, not something a reader needs, so
//                          no label, tooltip or chart band names it.
//   · PRIMARY_BUDGET_USD — the priority line. At or above it an opportunity is
//                          PRIMARY and leads every ranking. Below it — or with
//                          no value disclosed — it is SECONDARY: still
//                          collected, still searchable, still shown, just
//                          ranked behind the primary band.
//
// A notice that discloses NO value is never removed by the floor. Its value is
// unknown, not small, and that is how most EU TED tenders are published — 456
// of the 466 in-domain rows held when this policy was written. It reads as
// SECONDARY, which is the honest answer: unknown is not proven large.
export const MIN_BUDGET_USD = 10_000_000;
export const PRIMARY_BUDGET_USD = 15_000_000;

/**
 * Stand-in value for a notice that discloses no budget, so every record carries
 * a number the UI can format.
 *
 * Set to the primary line by product decision: the portal presents an
 * undisclosed notice at the threshold rather than at a token figure, so no card
 * reads as small work merely because its buyer published no amount.
 *
 * Two consequences, stated plainly because they are easy to be surprised by:
 *
 *  1. An undisclosed notice therefore reads as PRIMARY. Since the great
 *     majority of notices disclose nothing, the primary band is effectively the
 *     whole board, and the secondary band holds only those few notices that
 *     disclose a value between the collection floor and the primary line. The
 *     tier machinery is unchanged and still sorts correctly — there is simply
 *     little left for it to separate.
 *  2. Any figure summed from this value — the Primary Pipeline KPI, the budget
 *     band chart — counts the stand-in, not money a buyer has committed to. It
 *     is a presentational floor, not evidence of contract value.
 *
 * The fit score deliberately does NOT read this value; it scores the disclosed
 * amount only (see lib/scoring.ts), so an undisclosed notice cannot earn points
 * for a number nobody published.
 */
export const UNDISCLOSED_BUDGET_USD = PRIMARY_BUDGET_USD;

/**
 * Retention floor for purgeExpired — deliberately LOWER than the collection
 * floor, and deliberately not raised alongside it.
 *
 * Raising MIN_BUDGET_USD decides what the portal COLLECTS and SHOWS. It must
 * not decide what the portal DESTROYS: rows already held are hidden by the read
 * query the moment the floor moves, so deleting them buys nothing, and it would
 * make every future adjustment of the floor one-way — the history it discards
 * only comes back if a source still happens to be publishing the notice.
 *
 * This is the same rule the domain filter at the top of this file follows, for
 * the same reason: hidden, not erased. Purge exists to drop notices that are
 * genuinely spent — deadline passed, listing gone stale — not to enforce a
 * commercial threshold that may be retuned next quarter.
 */
export const RETENTION_MIN_BUDGET_USD = 1_000_000;

export type BudgetTier = "primary" | "secondary";

/** Which band a contract value falls in. Undisclosed reads as secondary. */
export function budgetTier(budgetUsd: number | null | undefined): BudgetTier {
  return budgetUsd != null && budgetUsd >= PRIMARY_BUDGET_USD ? "primary" : "secondary";
}

/** Sort key — 0 for primary, 1 for secondary, so ascending puts primary first. */
export function budgetTierRank(budgetUsd: number | null | undefined): number {
  return budgetTier(budgetUsd) === "primary" ? 0 : 1;
}

/**
 * Board contract-value policy: an opportunity is shown only when its buyer
 * PUBLISHED a value and that value is at or above the primary line.
 *
 * Both halves are load-bearing, and the order matters. A bare
 * `budget >= PRIMARY_BUDGET_USD` would keep every undisclosed notice on the
 * board, because UNDISCLOSED_BUDGET_USD *is* the primary line — the stand-in
 * would clear the very threshold it was never measured against. So
 * `budgetDisclosed` is consulted first, exactly as Project.budgetDisclosed
 * instructs.
 *
 * This hides; it never deletes. Rows below the line stay in the table and come
 * straight back into view if the line moves — the same "hidden, not erased"
 * rule the domain filter and RETENTION_MIN_BUDGET_USD already follow.
 */
export function meetsBoardBudgetPolicy(p: {
  budget: number | null;
  budgetDisclosed: boolean;
}): boolean {
  return p.budgetDisclosed && p.budget != null && p.budget >= PRIMARY_BUDGET_USD;
}

/** Does a value clear the collection floor? An undisclosed value always does. */
export function meetsBudgetFloor(budgetUsd: number | null | undefined): boolean {
  return budgetUsd == null || budgetUsd >= MIN_BUDGET_USD;
}

/**
 * Project types that represent a contract somebody can actually bid for.
 *
 * The one that is deliberately absent is "Open Opportunity", which is what the
 * World Bank *operations* feed produces — see connectors/world-bank.ts. Those
 * records are development loans ("Second Karachi Water and Sewerage Services
 * Improvement Project"), not tenders: there is nothing to submit and no way to
 * win one. The biddable contracts issued underneath them arrive separately,
 * through connectors/world-bank-tenders.ts, and land as "Government Tender".
 */
const BIDDABLE_PROJECT_TYPES: ReadonlySet<string> = new Set([
  "Government Tender",
  "RFP",
  "RFQ",
  "IT Procurement",
]);

/**
 * Board bid policy: is this an opportunity somebody could still bid for today?
 *
 * Two things have to be true, and the second is the one that is easy to miss.
 *
 * 1. There is a bid date, and it has not passed. A MISSING date does not count.
 *    statusFor() reports a notice with no deadline as "Open" — correctly, since
 *    an absent date means unknown rather than expired — so a `status !==
 *    "Closed"` test alone lets dateless records onto the board and presents them
 *    as live bids.
 *
 * 2. It is a biddable contract, not a programme. This is what separates an
 *    active bid date from a date that merely looks like one. A World Bank
 *    operation carries its programme CLOSING date — routinely 2029 or 2030 —
 *    and that date passes every freshness test there is while describing
 *    nothing a bidder can act on. Six of the seven opportunities the board
 *    showed before this policy existed were operations of exactly that kind,
 *    each displaying a 2029/2030 date where a bid deadline belongs.
 *
 * Like the contract-value policy, this hides rather than deletes: the rows stay
 * in the table, remain searchable, and come straight back if the policy changes.
 */
export function isActivelyBiddable(p: {
  status: string;
  deadline: string;
  projectType: string;
}): boolean {
  if (p.status === "Closed" || p.status === "Awarded") return false;
  if (!p.deadline) return false;
  return BIDDABLE_PROJECT_TYPES.has(p.projectType);
}

// ---- fit-score inputs ----------------------------------------------
// The two business judgements the rule-based score depends on. They live here,
// beside the other scope constants, because they are the only parts of the
// score that are a commercial decision rather than a property of the notice —
// everything else in lib/scoring.ts is keyword matching over the notice text.
//
// PRIORITY_COUNTRIES is seeded with the markets the connectors actually cover
// directly (UK Contracts Finder, SAM.gov) plus the EU, whose TED feed supplies
// most of the volume. Edit this list to match where the BD team actually wants
// to bid — it is read by exactly one rule and changes nothing else.
export const PRIORITY_COUNTRIES: string[] = [
  "United Kingdom",
  "United States",
  "Ireland",
  "Germany",
  "France",
  "Netherlands",
  "Spain",
  "Italy",
  "Poland",
];

/** A deadline this close still scores; further out it does not. */
export const DEADLINE_SOON_DAYS = 30;

/**
 * The score at or above which an opportunity is RECOMMENDED — worth a bid team
 * actually looking at.
 *
 * Read by the dashboard KPI, the seed's "Best Fit" tag, the Explorer's fit
 * filter and the badge colours, so none of them can disagree about what a
 * strong fit means.
 *
 * Set from the measured distribution, not by taste. Under the recalibrated rule
 * table in lib/scoring.ts, 522 stored in-domain rows produce:
 *
 *    20–29   2 | 30–39  15 | 40–49  28 | 50–59  73
 *    60–69 130 | 70–79 132 | 80–89  13
 *
 * 70 is ~37% of the board: enough to work through, selective enough to mean
 * something. Reaching it requires a core focus area plus real capability
 * evidence in the notice — a supporting Digital Engineering match cannot get
 * there on its own, by design.
 *
 * This was 40 under the previous rubric, where the ceiling was so low that only
 * 2 rows in 790 cleared 70. The rubric changed so the number could mean what a
 * reader assumes it means; see the header of lib/scoring.ts.
 *
 * Re-measure after any change to the rule table:
 *   curl "<host>/api/cron/reclassify?dryRun=1&key=$CRON_SECRET" | jq .scoreHistogram
 */
export const HIGH_FIT_THRESHOLD = 70;

export function isTargetServiceLine(serviceLine: string): boolean {
  return (TARGET_SERVICE_LINES as string[]).includes(serviceLine);
}

export function isTargetProject(p: Project): boolean {
  return isTargetServiceLine(p.serviceLine);
}

/** Keep only in-domain projects. Used for the bundled seed; the database
 *  path filters in SQL so paging and limits stay correct. */
export function toTargetDomain(projects: Project[]): Project[] {
  return projects.filter(isTargetProject);
}
