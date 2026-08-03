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

/** The only service lines the portal surfaces. Widen here to re-include work. */
export const TARGET_SERVICE_LINES: ServiceLine[] = [
  "Geospatial Intelligence",
  "Telecom & Network Engineering",
  "Geospatial & Telecom Adjacent",
];

/** Delivery categories that map into the target service lines. */
export const TARGET_CATEGORIES: ProjectCategory[] = [
  "GIS",
  "Telecom / Network",
  "Geospatial / Telecom Adjacent",
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
 * The score at or above which an opportunity counts as "high fit".
 *
 * Read by the dashboard KPI, the seed's "Best Fit" tag, the Explorer's fit
 * filter and the badge colours, so none of them can disagree about what high
 * fit means.
 *
 * Set from the measured distribution, not by taste. Across 790 stored rows the
 * rule table in lib/scoring.ts produces:
 *
 *     0–9  162 | 10–19 143 | 20–29  69 | 30–39 213
 *   40–49  195 | 50–59   3 | 60–69   3 | 70+     2
 *
 * The ceiling is low because most TED notices disclose no budget (−15) and sit
 * outside PRIORITY_COUNTRIES (−10), so even a strong record rarely clears 50.
 * 40 is the top quartile of the real board and means the notice matched at
 * least two substantive capability rules. Raising it to 70 would leave the KPI
 * showing 2 of 790, which tells a reader nothing.
 *
 * Re-measure after any change to the rule table:
 *   curl "<host>/api/cron/reclassify?dryRun=1&key=$CRON_SECRET" | jq .scoreHistogram
 */
export const HIGH_FIT_THRESHOLD = 40;

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
