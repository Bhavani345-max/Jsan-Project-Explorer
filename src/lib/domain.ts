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
