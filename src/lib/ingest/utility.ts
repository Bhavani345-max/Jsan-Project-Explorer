// ------------------------------------------------------------------
// Utility Network Intelligence — electrical, water and gas.
//
// The connected operating model JSAN delivers to distribution utilities:
// field survey → asset digitization → consumer indexing → topology validation
// → enterprise GIS migration. One notice usually names two or three of those
// stages, which is why they are matched as one vocabulary rather than five.
//
// This is NOT the utility sector at large. A procurement feed carries far more
// electricity, water and gas notices than anything else JSAN pursues, and
// almost none of them are this work:
//
//     "Supply of electricity for the period 2027-2030"          — a commodity
//     "Construction work for water and sewage pipelines"        — civil works
//     "Kamerauntersuchung der Grundstücksentwässerungsanlagen"  — CCTV plumbing
//
// So a notice qualifies only when it names BOTH a utility network AND work on
// the data that describes it. Neither half alone is enough, which is the same
// two-part contract lib/ingest/scope.ts uses for off-sector services.
//
// The pairing is tiered, because the two halves are not equally reliable:
//
//   · a STRONG sector term ("electricity distribution", "water main", "feeder
//     cable") names a distribution network outright, so any survey-or-data term
//     alongside it is enough;
//   · a WEAK one (bare "utility", "power", "water", "gas") is a word that turns
//     up everywhere, so it needs an unambiguous activity — "consumer indexing",
//     "asset digitisation", "enterprise GIS" — before it counts.
//
// Measured against the 763 stored notices, the untiered version of this rule
// claimed one row: a Danish GIS consultancy framework listing "land
// acquisition, GIS, CAD, mapping and utilities". Bare "utilities" beside bare
// "GIS" is exactly the coincidence the tiering exists to reject.
// ------------------------------------------------------------------

/**
 * Terms that name a distribution network on their own.
 *
 * "feeder" is qualified deliberately — feeder ROADS and feeder SCHOOLS are
 * common in development-bank notices and have nothing to do with a grid.
 */
const SECTOR_STRONG =
  /electric(?:ity|al) (?:distribution|network|grid|utility|supply network)|power (?:distribution|grid|utility|network)|distribution (?:network|system) operator|\bdso\b|\bdiscom\w*|feeder (?:line|cable|network|circuit|mapping|survey)\w*|substation\w*|distribution transformer\w*|\d{1,3}\s?kv\b|(?:medium|low|high)[- ]voltage|water (?:supply|distribution|network|utility|utilities|board|authority|main)\w*|potable water|drinking water|sewer\w*|waste ?water|storm ?water|gas (?:distribution|network|grid|utility|main|pipeline)\w*|city gas|natural gas network|utility (?:network|asset|infrastructure|customer|consumer)\w*/i;

/** Words for the same industries that are far too common to stand alone. */
const SECTOR_WEAK =
  /\butilit(?:y|ies)\b|electric(?:al|ity)\w*|\bpower\b|\bwater\b|\bgas\b|\benergy\b|pipeline\w*|\bmeter(?:ing|s)?\b/i;

/**
 * Work on the data that describes the network — unambiguous enough to qualify a
 * notice on its own, next to even a weak sector term.
 */
const ACTIVITY_STRONG =
  /consumer indexing|customer indexing|consumer census|(?:consumer|customer) (?:data )?mapping|asset digit(?:i[sz]ation|i[sz]ing)|digiti[sz]ation of (?:the )?(?:asset|network|record|map|drawing|plan|infrastructure)\w*|network digiti[sz]\w*|asset (?:register|inventory|mapping|tagging|coding|survey)\w*|utility (?:network )?(?:model|mapping|detection|survey|record)\w*|enterprise gis|gis (?:migration|implementation|rollout|platform|roadmap|strateg)\w*|utility network model|geodatabase|arcgis|network topolog\w*|topolog(?:y|ical) (?:validation|verification|correction|survey)\w*|network connectivity|connectivity (?:model|validation|analysis)\w*|as-?built (?:record|mapping|drawing|data)\w*|field survey|door-?to-?door survey|network survey|route survey/i;

/**
 * Weaker signals that still count when the sector term is unambiguous.
 *
 * Bare "survey" and bare "mapping" are deliberately absent. With "sewer" as the
 * sector term they matched a whole family of CCTV pipe-inspection tenders
 * ("Optische Inspektion der Hauptkanäle", "pressure testing, disinfection") —
 * a different trade entirely. Only qualified forms are listed.
 */
const ACTIVITY_SUPPORTING =
  /\bgis\b|geographic information|geospatial|spatial data|topographic survey|detection of [^.;]{0,40}?\b(?:networks?|mains?|pipes?|cables?|utilities|services)\b|locating of (?:underground )?(?:utilities|services)|base ?map\w*|land ?base\b|network model\w*|asset condition (?:survey|assessment)|smart metering (?:gis|data|platform)|\badms\b|\bnms\b/i;

/**
 * "GIS" in an electricity notice very often means Gas-Insulated Switchgear, not
 * a geographic information system — TED's live feed carries "GIS Bundle 2026"
 * filed under "Electricity distribution and control apparatus". Those are
 * equipment purchases; the goods gate catches the ones that publish a CPV
 * label, and this catches the rest.
 */
const SWITCHGEAR =
  /switch ?gear|gas[- ]insulated|circuit breaker\w*|control apparatus|\bgis\b[- ]?(?:bundle|substation|switch)/i;

/**
 * Building the network is not describing it. A notice that is civil works and
 * nothing else is excluded, but one that also produces asset data is kept —
 * "as-built records" and "asset register" deliverables are routinely bought
 * alongside the construction contract, and they are the part JSAN delivers.
 */
const CONSTRUCTION =
  /construction|erection|laying|trenching|excavation|civil works|refurbishment|rehabilitation of|augmentation of|installation of|supply and (?:installation|erection|laying|delivery)/i;

const DATA_DELIVERABLE =
  /\bgis\b|geographic information|geospatial|geodatabase|digit(?:i[sz]ation|i[sz]ing|al twin)|indexing|topolog\w*|asset (?:register|inventory|mapping)\w*|as-?built|base ?map\w*|network model\w*|spatial data/i;

/**
 * True when the notice is work on a utility network's asset and consumer data —
 * JSAN's Utility Network Intelligence line.
 */
export function isUtilityNetworkIntelligence(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (SWITCHGEAR.test(t)) return false;

  const qualifies = SECTOR_STRONG.test(t)
    ? ACTIVITY_STRONG.test(t) || ACTIVITY_SUPPORTING.test(t)
    : SECTOR_WEAK.test(t) && ACTIVITY_STRONG.test(t);
  if (!qualifies) return false;

  // Civil works with no data deliverable is somebody else's contract.
  return !CONSTRUCTION.test(t) || DATA_DELIVERABLE.test(t);
}

/** Which utility this notice concerns, for the technology facet. Order is by
 *  specificity: a notice naming two utilities reports the first it matches. */
export function utilitySectors(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const out: string[] = [];
  if (/electric\w*|power (?:distribution|grid|utility|network)|\bdiscom\w*|substation|feeder|\d{1,3}\s?kv\b|voltage/i.test(t))
    out.push("Electrical Utility");
  if (/\bwater\b|potable|sewer\w*|waste ?water|storm ?water|sanitation/i.test(t)) out.push("Water Utility");
  if (/\bgas\b|city gas|\blpg\b|pipeline/i.test(t)) out.push("Gas Utility");
  return out;
}
