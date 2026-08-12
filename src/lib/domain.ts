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
 * The service lines the portal surfaces — JSAN's seven capability focus areas.
 *
 * All seven are carried. The portal previously surfaced only the three
 * geospatial/telecom lines and hid the rest, which meant staffing, PMO and
 * digital-engineering opportunities were ingested and then never shown.
 *
 * "Utility Network Intelligence" is the newest line: the connected operating
 * model JSAN delivers to electrical, water and gas distribution utilities.
 * Adding it changed no stored record — measured over the 763 rows held when it
 * was introduced, the classifier claimed none of them, because this work was
 * not reaching the portal at all. See lib/ingest/utility.ts.
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

// JSAN's target contract value. One source of truth for a number that is
// applied in four places — the ingest floor (normalize), the purge floor (db),
// the Explorer's default band, and the dashboard's "target pipeline" KPI. When
// these drift apart the same opportunity is counted differently on every
// screen, so they all read from here.
export const TARGET_MIN_BUDGET_USD = 1_000_000;
export const TARGET_MAX_BUDGET_USD = 10_000_000;

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
