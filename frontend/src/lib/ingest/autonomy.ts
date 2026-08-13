// ------------------------------------------------------------------
// Autonomous Mobility Services — the three capability pillars.
//
// Scraped from slide 2 of JSAN_Autonomous_Mobility_Services.pptx ("Capability
// Architecture"), which states the offer as three columns and six sub-topics
// each. Those eighteen sub-topics are carried verbatim into the technology
// vocabulary in lib/ingest/normalize.ts, so the Explorer's quick filters read
// as the same architecture the deck shows a client:
//
//   1  Autonomous Data Engineering
//        multi-sensor data ingestion · camera and LiDAR processing ·
//        data cleansing and normalization · sensor synchronization ·
//        metadata and dataset management · privacy/anonymization support
//   2  Geospatial & Perception Intelligence
//        object detection datasets · lane and road-boundary intelligence ·
//        traffic signs and signals · HD map and roadgraph support ·
//        localization datasets · scenario and edge-case intelligence
//   3  Validation & Managed Operations
//        human validation · multi-level quality checks · defect adjudication ·
//        dataset acceptance governance · release-readiness support ·
//        production assurance
//
// ---- why this is not just a keyword list ---------------------------
// This file follows the same two-part, tiered contract as lib/ingest/utility.ts,
// and for the same reason. A procurement feed carries far more notices that
// merely mention a vehicle, a fleet or a road than it carries autonomy data
// work, and almost none of them are this:
//
//     "Supply and maintenance of 24 refuse collection vehicles"  — goods
//     "Driver training and licence acquisition services"         — training
//     "Mobile mapping LiDAR survey of the highway network"       — a GIS survey
//
// The last one is the dangerous case: it is real JSAN work, it is already
// classified correctly as Geospatial Intelligence, and a loose autonomy rule
// would steal it. So a notice qualifies only when it names BOTH an autonomous-
// mobility context AND work on the data that makes autonomy possible, with the
// same tiering utility.ts uses:
//
//   · a STRONG domain term ("autonomous vehicle", "self-driving", "robotaxi",
//     "ADAS") names the programme outright, so any supporting data activity
//     alongside it counts;
//   · a WEAK one (bare "vehicle", "fleet", "automotive") is a word that turns
//     up everywhere, so it needs an unmistakable autonomy-data activity —
//     "ground truth", "semantic segmentation", "roadgraph", "defect
//     adjudication" — before it counts.
//
// "Point cloud processing" and "sensor calibration" are deliberately in the
// SUPPORTING tier, not the unmistakable one. Both are ordinary mobile-mapping
// and survey vocabulary, and promoting them is exactly what would pull the
// highway-survey notice above out of the geospatial line.
// ------------------------------------------------------------------
import type { ProjectCategory } from "@/lib/types";

/**
 * Terms that name an autonomous-mobility programme on their own.
 *
 * "CAV" and "AMR" are deliberately absent: as bare acronyms they collide with
 * constant-air-volume HVAC plant and with warehouse robots respectively, and
 * neither collision is worth the handful of notices they would add.
 *
 * "AV" is the industry's own shorthand and is carried, but only immediately
 * before a data noun. On its own it is audio-visual, which a procurement feed
 * is full of — "AV equipment for lecture theatres", "AV installation works".
 */
const DOMAIN_STRONG =
  /autonomous[- ](?:vehicle|driving|mobility|shuttle|bus|fleet|transport|navigation|system|platform|stack)\w*|self-?driving|driverless|robo-?taxi\w*|robo-?shuttle\w*|\badas\b|advanced driver[- ]assist\w*|automated driving (?:system|function|feature|stack)\w*|automated vehicle\w*|sae level [2-5]\b|level [45] (?:autonom|automat|driving)\w*|connected and automated (?:mobility|vehicle|driving)\w*|unmanned ground vehicle\w*|autonomy stack|perception stack|\bav\b(?= (?:data|dataset|fleet|training|programme|program|stack|perception|validation|annotation))/i;

/** Words for the same industry that are far too common to stand alone. */
const DOMAIN_WEAK =
  /\bvehicle\w*\b|\bfleet\b|\bdriving\b|\bdriver\b|\bautomotive\b|\btelematics\b|in-?vehicle|\bmobility\b|\bodometry\b/i;

/**
 * Work that only autonomy data production buys. Unmistakable enough to qualify
 * a notice next to even a weak domain term.
 */
const ACTIVITY_AV =
  /ground[- ]truth\w*|semantic segmentation|instance segmentation|panoptic segmentation|bounding box\w*|\bcuboid\w*|(?:image|video|sensor|lidar|point ?cloud)[- ]annotation|annotation of (?:image|video|sensor|lidar|point ?cloud)\w*|data (?:annotation|labell?ing)|image labell?ing|object detection (?:dataset|annotation|training|model)\w*|training data(?:set)?s? (?:labell?ing|annotation|creation|curation)|\bhd map\w*|high-?definition map\w*|roadgraph|road graph|lane (?:polyline|geometry|boundary|boundaries|marking)\w* (?:extraction|annotation|dataset|intelligence)|road-?boundary intelligence|sensor fusion|multi-?sensor (?:data )?(?:ingestion|fusion|acquisition)|scenario (?:catalogu?e|library|database|mining|generation)|edge[- ]case (?:mining|library|intelligence|analysis|review)|human[- ]in[- ]the[- ]loop|human validation|defect adjudication|dataset acceptance|acceptance governance|release[- ]readiness|production assurance|locali[sz]ation dataset\w*|(?:face|licen[cs]e plate|number plate|registration plate) (?:blurring|redaction|anonymi[sz]ation|obfuscation)/i;

/**
 * Weaker signals that still count when the domain term is unambiguous.
 *
 * Everything here is vocabulary JSAN's other lines already own — survey,
 * mapping, QA, data engineering — which is precisely why none of it qualifies a
 * notice on its own.
 */
const ACTIVITY_SUPPORTING =
  /\blidar\b|point ?cloud\w*|\bradar\b|\bgnss\b|\bimu\b|camera (?:data|feed|image)\w*|perception|locali[sz]ation|\bannotation\b|labell?ing|training data|\bdataset\w*|quality (?:control|assurance|check|gate)\w*|\bvalidation\b|\bqa\b|\bqc\b|data (?:processing|cleansing|cleaning|curation|normali[sz]ation|ingestion|pipeline)|metadata|anonymi[sz]ation|pseudonymi[sz]ation|sensor (?:synchroni[sz]ation|calibration|data)|simulation|traffic (?:sign|signal|light)\w*|lane (?:detection|marking)\w*/i;

/**
 * Running or maintaining a vehicle fleet is not producing data about the world
 * it drives through. These notices routinely carry "vehicle", "driver" and
 * "fleet" and have nothing to do with autonomy.
 */
// A bare "driving test" is deliberately NOT here. It is the licence exam in an
// ordinary tender and an autonomy programme's own vocabulary in this one —
// "self-driving test fleet", "automated driving test track" — so only the
// licence-shaped phrasings are matched.
const TRANSPORT_OPERATIONS =
  /driving (?:school|licen[cs]e|instructor|lesson)\w*|driving test cent(?:re|er)\w*|theory test\w*|driver (?:training|recruitment|shortage|welfare)|vehicle (?:maintenance|repair|servicing|hire|rental|leasing|inspection|roadworthiness|cleaning|recovery|breakdown)|bus (?:service|operation|route|shelter)\w*|taxi service\w*|passenger transport|school transport|home[- ]to[- ]school|fleet (?:insurance|fuel|hire|rental|leasing|management service)\w*|car park\w*|parking (?:enforcement|management|permit)\w*|road (?:maintenance|resurfacing|gritting|sweeping)|fuel card\w*/i;

/**
 * True when the notice is autonomous-mobility data work — the offer slide 2 of
 * the capability deck describes.
 */
export function isAutonomousMobility(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (TRANSPORT_OPERATIONS.test(t)) return false;

  return DOMAIN_STRONG.test(t)
    ? ACTIVITY_AV.test(t) || ACTIVITY_SUPPORTING.test(t)
    : DOMAIN_WEAK.test(t) && ACTIVITY_AV.test(t);
}

// ---- which of the three pillars ------------------------------------
// The deck presents the three as one architecture, and a real notice usually
// touches more than one of them — "annotation, QC and adjudication for HD map
// production" is all three at once. So the notice is filed under whichever
// pillar it names MOST, counted as distinct matched terms.
//
// Ties resolve in the deck's own left-to-right order (data → perception →
// validation), which is also the order the work is delivered in. That is an
// arbitrary rule, but it is a STABLE one: the same title always lands in the
// same pillar, which is what the reclassify job and the fit score both need.

const PILLARS: { category: ProjectCategory; pattern: RegExp }[] = [
  {
    // 1 · Autonomous Data Engineering
    category: "Autonomous Vehicle Data",
    pattern:
      /multi-?sensor\w*|sensor (?:data|fusion|synchroni[sz]ation|calibration|ingestion)\w*|camera and lidar|lidar and camera|camera\/lidar|lidar (?:data )?processing|point ?cloud (?:processing|ingestion)|data (?:cleansing|cleaning|normali[sz]ation|ingestion|pipeline|curation)|metadata\w*|dataset management|data management|anonymi[sz]ation|pseudonymi[sz]ation|blurring|redaction|\bimu\b|\bgnss\b|\bradar\b|raw (?:sensor|vehicle) data/gi,
  },
  {
    // 2 · Geospatial & Perception Intelligence
    category: "Perception & Road Intelligence",
    pattern:
      /object detection|object recognition|semantic segmentation|instance segmentation|panoptic\w*|bounding box\w*|\bcuboid\w*|polyline\w*|lane\w*|road[- ](?:boundar\w*|edge|marking)\w*|traffic (?:sign|signal|light)\w*|\bhd map\w*|high-?definition map\w*|roadgraph|road graph|locali[sz]ation\w*|semantic (?:map|road model)\w*|scenario\w*|edge[- ]case\w*|pedestrian\w*|cyclist\w*|obstacle\w*|perception|annotation|labell?ing|ground[- ]truth\w*|training data\w*/gi,
  },
  {
    // 3 · Validation & Managed Operations
    category: "Validation & QA Operations",
    pattern:
      /human (?:validation|review)|human[- ]in[- ]the[- ]loop|quality (?:check|control|assurance|gate)\w*|multi-?level (?:qa|quality)\w*|multi-?stage (?:qa|quality)\w*|\bqa\b|\bqc\b|defect adjudication|defect (?:closure|resolution|triage)|dataset acceptance|acceptance (?:governance|criteria)|release[- ]readiness|production assurance|traceabilit\w*|audit trail\w*|sampling (?:plan|inspection)\w*|managed (?:desk |production )?operations?|desk operations?/gi,
  },
];

/** Distinct terms a pillar's vocabulary matches in the text. */
function pillarScore(pattern: RegExp, text: string): number {
  // Fresh regex per call: the module-level patterns carry /g, and a shared
  // lastIndex across calls would make the answer depend on call order.
  const re = new RegExp(pattern.source, pattern.flags);
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) seen.add(m[0].trim().toLowerCase());
  return seen.size;
}

/**
 * The autonomous-mobility delivery category this notice belongs to, or null
 * when it is not autonomy data work at all.
 */
export function autonomousMobilityCategory(
  text: string | null | undefined,
): ProjectCategory | null {
  const t = (text ?? "").trim();
  if (!isAutonomousMobility(t)) return null;

  let best = PILLARS[0];
  let bestScore = -1;
  for (const pillar of PILLARS) {
    const score = pillarScore(pillar.pattern, t);
    // Strictly greater, so an earlier pillar wins a tie — see the note above.
    if (score > bestScore) {
      best = pillar;
      bestScore = score;
    }
  }
  return best.category;
}

/**
 * Which of the three pillars a notice touches, for the technology facet and for
 * explaining a classification. Reported in the deck's order, not by strength.
 */
export function autonomyPillars(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const labels: Record<string, string> = {
    "Autonomous Vehicle Data": "Autonomous Data Engineering",
    "Perception & Road Intelligence": "Geospatial & Perception Intelligence",
    "Validation & QA Operations": "Validation & Managed Operations",
  };
  return PILLARS.filter((p) => pillarScore(p.pattern, t) > 0).map(
    (p) => labels[p.category as string],
  );
}
