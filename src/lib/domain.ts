// ------------------------------------------------------------------
// Target domain — the single source of truth for what this portal is for.
//
// JSAN pursues geospatial and telecom/network engineering work. Everything
// else a public procurement feed carries (generic software development,
// health, education, finance, construction) is out of scope.
//
// The filter is applied in two places and NEVER deletes anything:
//   · at ingest — out-of-domain notices are not persisted, so the store
//                 stops accumulating noise from here on;
//   · at read   — rows already stored simply stop surfacing.
//
// Records collected before this filter existed are retained in full. They
// are hidden, not erased, and become visible again by widening this list.
// ------------------------------------------------------------------
import type { Project, ProjectCategory, ServiceLine } from "@/lib/types";

/** The only service lines the portal surfaces. Widen here to re-include work. */
export const TARGET_SERVICE_LINES: ServiceLine[] = [
  "Geospatial Intelligence",
  "Telecom & Network Engineering",
];

/** Delivery categories that map into the target service lines. */
export const TARGET_CATEGORIES: ProjectCategory[] = ["GIS", "Telecom / Network"];

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
