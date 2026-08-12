// ------------------------------------------------------------------
// Scope gates — what the portal refuses to carry, and why.
//
// Two exclusions live here, both applied at ingest AND at read, and neither
// ever deletes anything (see lib/ingest/goods.ts for the same contract):
//
//   1. goods procurement  — JSAN delivers services, it does not trade product.
//   2. off-sector service — the contract's SUBJECT is an industry JSAN does not
//                           work in (clinical care, catering, cleaning, …).
//
// The second needs care, and the reason is worth stating because it is the
// mistake a keyword list makes on its own:
//
//     "Telecommunications services - telephony at General Hospital"
//     "Topographical services - agricultural and forestry land development"
//
// Both mention an off-sector industry. Both are exactly the work JSAN does —
// the hospital and the farm are the CUSTOMER, not the subject. Excluding on the
// industry word alone would throw away real telecom and survey leads.
//
// So an off-sector term only disqualifies a notice when the notice carries no
// core capability evidence at all. "Managed Service for the Provision of Renal
// Dialysis Services" has none and goes; "Fixed and mobile telephony services at
// General Hospital" has telephony and stays.
// ------------------------------------------------------------------
import { isGoodsProcurement, goodsReason } from "@/lib/ingest/goods";

/**
 * Industries whose SERVICES JSAN does not deliver.
 *
 * Deliberately excludes agriculture, forestry, fishery, veterinary, marine and
 * oceanography. Those look off-domain but are among the biggest real consumers
 * of geospatial work — land survey, remote sensing, Copernicus marine data —
 * and listing them cost genuine leads when tried.
 */
const OFF_SECTOR =
  /\b(?:dialysis|renal|clinical|medical|medicine|healthcare|health care|patient|hospital|nursing|nurse|dental|pharmac\w*|ambulance|vaccinat\w*|immunis\w*|surgery|surgical|catering|canteen|meals?|food|cleaning|janitorial|laundry|security guard\w*|manned guarding|childcare|social care|homecare|home care|tuition|teaching|funeral)\b/i;

/**
 * Core capability evidence. Its presence means the notice is JSAN work being
 * delivered TO an off-sector customer, rather than off-sector work itself.
 */
const CORE_CAPABILITY =
  /\bgis\b|geospatial|geographic information|geodet\w*|cadastr\w*|topograph\w*|cartograph\w*|land registry|orthophoto|photogrammetr\w*|lidar|remote sensing|earth observation|satellite|spatial data|survey(?:ing|s)?\b|\bmapping\b|hydrograph\w*|telecom\w*|telephon\w*|\b5g\b|\b4g\b|fibre|fiber optic\w*|broadband|\bfttx\b|\bftth\b|network (?:engineering|design|planning|infrastructure)|structured cabling|base station|antenna\w*|backhaul|data transmission|switchboard|\biot\b|\bscada\b|digital twin|sensor network|telemetry|smart cit\w*|consumer indexing|customer indexing|asset digit(?:i[sz]ation|i[sz]ing)|asset (?:register|inventory)\w*|network topolog\w*|enterprise gis|geodatabase|utility network\w*/i;

/**
 * True when the notice's subject is an industry JSAN does not work in, and it
 * carries no core capability that would make it JSAN work regardless.
 */
export function isOffSectorService(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  if (!t) return false;
  if (!OFF_SECTOR.test(t)) return false;
  return !CORE_CAPABILITY.test(t);
}

/**
 * The single scope gate the ingest and read paths call. Composes every reason a
 * notice is not carried, so a new exclusion is added in one place.
 */
export function isOutOfScope(title: string | null | undefined): boolean {
  return isGoodsProcurement(title) || isOffSectorService(title);
}

/** Short human-readable reason, or null when the notice is in scope. */
export function outOfScopeReason(title: string | null | undefined): string | null {
  const goods = goodsReason(title);
  if (goods) return goods;
  if (isOffSectorService(title)) return "the contract is for an industry JSAN does not deliver in";
  return null;
}
