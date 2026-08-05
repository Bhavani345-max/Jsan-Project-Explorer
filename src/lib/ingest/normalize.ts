// ------------------------------------------------------------------
// Normalization + heuristic enrichment for ingested opportunities.
//
// Turns a raw record from any connector into the fields the portal needs,
// deterministically and with zero external calls: currency→USD, JSAN service
// line, delivery category, extracted technologies, tags, and a capability-fit
// score. AI enrichment (optional, see ai-enrich.ts) can refine the summary on
// top of this — but the portal is fully functional on these heuristics alone.
// ------------------------------------------------------------------
import crypto from "node:crypto";
import { TARGET_MIN_BUDGET_USD } from "@/lib/domain";
import type {
  ProjectCategory,
  ProjectType,
  ServiceLine,
  SourceType,
} from "@/lib/types";

/** What every connector emits — the raw, source-shaped opportunity. */
export interface RawOpportunity {
  sourceKey: string; // stable connector id, e.g. "uk-contracts-finder"
  source: string; // display name, e.g. "UK Contracts Finder"
  sourceType: SourceType;
  referenceNumber: string;
  title: string;
  description: string;
  organization: string;
  country: string;
  state?: string;
  amount: number | null; // in the original currency
  currency: string; // ISO code (GBP, EUR, USD, …)
  deadline: string | null; // ISO date or null
  publicationDate: string; // ISO date
  officialLink: string;
  contact?: { name?: string; email?: string; phone?: string } | null;
  tags?: string[];
}

/** A fully-normalized row ready to persist. Mirrors the opportunities table. */
export interface NormalizedOpportunity {
  id: string;
  referenceNumber: string;
  title: string;
  description: string;
  summary: string;
  organization: string;
  country: string;
  state: string;
  budgetUsd: number | null;
  currency: string;
  deadline: string | null;
  publicationDate: string;
  source: string;
  sourceType: SourceType;
  category: ProjectCategory;
  serviceLine: ServiceLine;
  fitScore: number;
  projectType: ProjectType;
  technologies: string[];
  tags: string[];
  eligibility: string;
  officialLink: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  industry: string;
}

// Approximate, intentionally-static FX rates to USD. Government budgets don't
// need spot accuracy; this normalizes cross-country figures for filtering and
// ranking. Update occasionally if precision ever matters.
const FX_TO_USD: Record<string, number> = {
  USD: 1, GBP: 1.27, EUR: 1.08, CAD: 0.73, AUD: 0.66, INR: 0.012,
  SEK: 0.095, NOK: 0.093, DKK: 0.145, PLN: 0.25, CHF: 1.12, BRL: 0.18,
  JPY: 0.0064, CNY: 0.14, ZAR: 0.055, AED: 0.27, SGD: 0.74, MYR: 0.22,
  NZD: 0.61, MXN: 0.05,
};

export function toUsd(amount: number | null, currency: string): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const rate = FX_TO_USD[(currency || "USD").toUpperCase()] ?? 1;
  return Math.round(amount * rate);
}

// Keyword → delivery category. First match wins; order matters (specific first).
const CATEGORY_RULES: [RegExp, ProjectCategory][] = [
  // GIS / geospatial. Deliberately specific: bare "mapping" and "spatial" were
  // dropped because "data mapping" and "spatial planning" are common in
  // unrelated IT and urban-planning notices.
  [/\bgis\b|geospatial|geographic information|digital mapping|mapping services|map-?making|cartograph|lidar|remote sensing|photogramm|orthophoto|topograph|cadastr|geodet|\bgnss\b|hydrographic|aerial survey|spatial data|surveying services|land administration|land registry/i, "GIS"],
  // Telecom / network engineering. "rf" as a bare token was dropped — too
  // short to be safe across TED's multilingual titles.
  //
  // Bare "networks" is accepted because it is a CPV category label in its own
  // right (32400000), but only when it isn't one of the many non-telecom
  // networks a procurement feed carries — road, rail, heating, water, power.
  //
  // The tail of this pattern closes gaps found by auditing real stored notices
  // that the portal was wrongly hiding: TED renders each title as
  // "Country – <English CPV label> – <native title>", so the CPV wording
  // ("Telephone and data transmission services") is always present and worth
  // matching directly. A few high-value native terms are included too, since the
  // native half of the title is often the only place the work is described —
  // German "Breitbandausbau" (broadband rollout) and French "boucle optique
  // locale" (local optical loop) were both being missed.
  [/telecom|fibre|fiber|\b5g\b|\b4g\b|\blte\b|\bgsm\b|broadband|network engineering|network cabling|structured cabling|network equipment|network infrastructure|network technolog|data network|oss\/bss|\bfttx\b|\bfttp\b|\bftth\b|mobile network|mobile-telephone|base station|antenna|microwave link|satellite communication|\bvsat\b|sd-wan|backhaul|broadcast transmission|radio frequency|communication lines|communications? and connectivity|communications? (?:products|services|systems|equipment|infrastructure|networks?)|digital infrastructure|telephone|data transmission|breitband|boucle optique|optical loop|local loop|leased line|dark fib|\bpstn\b|\bvoip\b|telecom gis|fielding|as-?built|make-?ready|pole attachment|outside plant|\bosp\b|permit acquisition|permitting|close-?out|(?<!road |rail |railway |transport |heating |water |sewer |power |energy |social |distribution |pipeline )\bnetworks\b/i, "Telecom / Network"],
  // Geospatial- and telecom-ADJACENT work: same field, not a pure GIS or
  // telecom contract. Ordered after both core rules so a fibre or surveying
  // notice always lands in its core line first, and before the generic
  // AI/cyber/data rules so this vocabulary wins over them.
  //
  // Kept deliberately tight. Bare "digitalisation" is NOT here: across TED it
  // overwhelmingly means scanning paper records ("Digitalisierung von Akten"),
  // not building infrastructure. Only the programme-shaped phrasings are
  // matched, which is how the World Bank names national broadband and digital
  // infrastructure operations ("Chad Digital Transformation Project").
  [/earth observation|copernicus|satellite imagery|aerial imagery|\buav\b|unmanned aerial|\bdrone\b|digital twin|\bbim\b|building information model|spatial data infrastructure|geodata|geo-?portal|geoinformation|land information system|smart cit|\biot\b|internet of things|sensor network|telemetry|\bscada\b|spectrum management|radio spectrum|emergency communication|public safety network|\btetra\b|network monitoring|network security|network operations cent|digital (?:transformation|acceleration|infrastructure|econom|connectivity|development)/i, "Geospatial / Telecom Adjacent"],
  [/machine learning|artificial intelligence|\bai\b|\bml\b|data science|neural|llm|computer vision/i, "AI/ML"],
  [/cyber|information security|infosec|penetration test|\bsoc\b|siem|threat|vulnerabilit/i, "Cyber Security"],
  [/data warehouse|data platform|\betl\b|data engineering|analytics platform|data lake|big data/i, "Data Engineering"],
  [/cloud migration|\bazure\b|\baws\b|\bgcp\b|migration to cloud|cloud transformation/i, "Cloud Migration"],
  [/devops|ci\/cd|kubernetes|\bk8s\b|docker|site reliability|\bsre\b/i, "DevOps"],
  [/mobile app|\bios\b|android|react native|flutter/i, "Mobile Development"],
  [/website|web application|web development|\bportal\b|web platform|frontend|front-end/i, "Web Development"],
  [/staff(?:ing|s)?\b|workforce|recruitment|resourcing|managed service|contingent labour|labor supply|staff augmentation|capacity augmentation|specialist delivery|delivery capacity|secondment|interim (?:staff|resource|management)|temporary (?:staff|personnel|labour|worker)|master vendor|agency worker|\bworkers\b|employment support|employment service|personnel (?:supply|service)|talent (?:acquisition|supply)|neutral vendor|\brpo\b/i, "Workforce Solutions"],
  [/programme management|program management|\bpmo\b|\bp3o\b|prince2|project management office|programme office|delivery assurance|portfolio management|(?:programme|project|delivery) governance|multi-?country (?:delivery|execution|programme|program)/i, "Program Management"],
  [/\berp\b|\bcrm\b|\bsap\b|oracle|enterprise software|business system|line of business/i, "Enterprise Software"],
];

/**
 * Classify a notice into a delivery category, or "Unclassified".
 *
 * The fallback used to be "Enterprise Software", which maps to Digital
 * Engineering. That was harmless while only the three geospatial/telecom lines
 * were surfaced — the mis-filed rows were hidden anyway. Now that all six focus
 * areas are surfaced, that same fallback would push every unmatched notice
 * (agriculture, health, education, construction) straight onto the board, so
 * a category has to be EARNED by matching a rule.
 */
export function categorize(text: string): ProjectCategory {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text)) return cat;
  return "Unclassified";
}

// Delivery category → JSAN capability focus area. GIS and Telecom are the core
// lines; the six mapped-to values are exactly the six areas the portal carries.
const CATEGORY_TO_SERVICE_LINE: Record<ProjectCategory, ServiceLine> = {
  GIS: "Geospatial Intelligence",
  "Telecom / Network": "Telecom & Network Engineering",
  "Geospatial / Telecom Adjacent": "Geospatial & Telecom Adjacent",
  "Workforce Solutions": "Strategic Workforce Solutions",
  "Program Management": "Structured Program Management",
  "AI/ML": "Digital Engineering",
  "Cloud Migration": "Digital Engineering",
  "Web Development": "Digital Engineering",
  "Mobile Development": "Digital Engineering",
  "Data Engineering": "Digital Engineering",
  "Enterprise Software": "Digital Engineering",
  "Cyber Security": "Digital Engineering",
  DevOps: "Digital Engineering",
  // Matched nothing — kept out of every focus area, and out of the portal.
  Unclassified: "Out of Scope",
};

export function serviceLineFor(category: ProjectCategory): ServiceLine {
  return CATEGORY_TO_SERVICE_LINE[category];
}

// Technology vocabulary — extracted by presence in the notice text.
const TECH_VOCAB: [RegExp, string][] = [
  [/\bgis\b|geospatial|arcgis|qgis/i, "GIS"],
  [/\b5g\b/i, "5G"],
  [/fibre|fiber optic|\bfttx\b|\bfttp\b/i, "Fiber Optics"],
  [/network planning|network design/i, "Network Planning"],
  [/oss\/bss|\boss\b|\bbss\b/i, "OSS/BSS"],
  [/\brf\b|rf planning|radio frequency/i, "RF Planning"],
  // Adjacent-field vocabulary, so the Technology filter is useful for the
  // adjacent service line too. Listed before the generic stack entries because
  // extractTechnologies keeps only the first 8 matches.
  [/lidar/i, "LiDAR"],
  [/remote sensing/i, "Remote Sensing"],
  [/earth observation|copernicus/i, "Earth Observation"],
  [/satellite/i, "Satellite"],
  [/digital twin/i, "Digital Twin"],
  [/\biot\b|internet of things|sensor network/i, "IoT"],
  [/\bscada\b|telemetry/i, "SCADA"],
  [/\bjava\b/i, "Java"],
  [/\bpython\b/i, "Python"],
  [/\breact\b/i, "React"],
  [/\bangular\b/i, "Angular"],
  [/spring boot|spring framework/i, "Spring Boot"],
  [/node\.?js/i, "Node.js"],
  [/\baws\b|amazon web services/i, "AWS"],
  [/\bazure\b/i, "Azure"],
  [/\bgcp\b|google cloud/i, "GCP"],
  [/artificial intelligence|\bai\b/i, "AI"],
  [/machine learning|\bml\b/i, "Machine Learning"],
  [/cyber security|cybersecurity/i, "Cyber Security"],
  [/devops/i, "DevOps"],
  [/\bsap\b/i, "SAP"],
  [/\boracle\b/i, "Oracle"],
  [/\bsql\b|postgres|mysql/i, "SQL"],
  [/kubernetes|\bk8s\b/i, "Kubernetes"],
  [/docker|container/i, "Docker"],
];

export function extractTechnologies(text: string): string[] {
  const out: string[] = [];
  for (const [re, name] of TECH_VOCAB) if (re.test(text) && !out.includes(name)) out.push(name);
  return out.slice(0, 8);
}

// The fit score now lives in lib/scoring.ts, which scores from the notice text
// itself and returns the rule-by-rule breakdown the detail page renders.
// Re-exported here so the ingest pipeline keeps its single import surface.
import { fitScoreFor } from "@/lib/scoring";
export { fitScoreFor, scoreFit } from "@/lib/scoring";
// Scope gate for goods/supply notices — re-exported so the ingest pipeline
// keeps its single import surface (see lib/ingest/goods.ts).
export { isGoodsProcurement, goodsReason } from "@/lib/ingest/goods";

const PROJECT_TYPE_BY_SOURCE: Record<string, ProjectType> = {
  "Government Procurement API": "Government Tender",
  "Public Tender API": "Government Tender",
  "Open Data Portal": "Open Opportunity",
  "RSS Feed": "Open Opportunity",
  "JSON Endpoint": "Open Opportunity",
  "XML Feed": "Open Opportunity",
};

function stableId(sourceKey: string, referenceNumber: string): string {
  const prefix =
    sourceKey.includes("contracts-finder") ? "UK"
      : sourceKey.includes("ted") ? "EU"
      : sourceKey.includes("world-bank") ? "WB"
      : sourceKey.includes("sam") ? "US"
      : "OP";
  const hash = crypto
    .createHash("sha1")
    .update(`${sourceKey}|${referenceNumber}`)
    .digest("hex")
    .slice(0, 12);
  return `${prefix}-${hash}`;
}

function fallbackSummary(description: string, title: string): string {
  const clean = (description || "").replace(/\s+/g, " ").trim();
  if (!clean) return title;
  return clean.length > 240 ? `${clean.slice(0, 237)}…` : clean;
}

// Opportunities with a *disclosed* budget below this are too small for JSAN's
// $1–10M target range and are filtered out. Undisclosed-budget notices are
// kept (value unknown, often large — e.g. most EU TED tenders) and default to
// $1M at read time so they sit at the bottom of the target band.
export const MIN_BUDGET_USD = TARGET_MIN_BUDGET_USD;

export function meetsMinBudget(o: NormalizedOpportunity): boolean {
  return o.budgetUsd == null || o.budgetUsd >= MIN_BUDGET_USD;
}

/**
 * Is this opportunity currently pursuable? A future deadline means open; with
 * no deadline we keep it only if it was published recently (stale, unbounded
 * listings are dropped). This is the single gate that keeps closed/old records
 * out of the portal across every source.
 */
export function isOpenOpportunity(o: NormalizedOpportunity, maxAgeDaysNoDeadline = 180): boolean {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (o.deadline) {
    const d = new Date(o.deadline);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() >= today.getTime();
  }
  const pub = new Date(o.publicationDate);
  if (Number.isNaN(pub.getTime())) return false;
  const ageDays = (today.getTime() - pub.getTime()) / 86_400_000;
  return ageDays <= maxAgeDaysNoDeadline;
}

/** Normalize a raw opportunity into a persistable, fully-enriched row. */
export function normalize(raw: RawOpportunity): NormalizedOpportunity {
  const text = `${raw.title} ${raw.description}`;
  // Categorize on the TITLE ALONE. Long descriptions — World Bank project
  // abstracts especially — mention "network" or "broadband" in passing and
  // pull in agriculture, disaster-relief and energy programmes that are
  // nothing to do with this portal. The title is the reliable signal: TED
  // titles carry the CPV label, and procurement titles are descriptive.
  //
  // Technologies still read the full text: they only decorate a record, they
  // never decide whether it is in domain.
  const category = categorize(raw.title);
  const serviceLine = serviceLineFor(category);
  const budgetUsd = toUsd(raw.amount, raw.currency);
  const technologies = extractTechnologies(text);
  const contact = raw.contact ?? null;

  const tags = Array.from(
    new Set([
      raw.country,
      category,
      ...(raw.tags ?? []),
    ].filter(Boolean) as string[]),
  ).slice(0, 6);

  return {
    id: stableId(raw.sourceKey, raw.referenceNumber),
    referenceNumber: raw.referenceNumber.slice(0, 120),
    title: raw.title.slice(0, 400),
    description: raw.description,
    summary: fallbackSummary(raw.description, raw.title),
    organization: raw.organization || "Unknown organization",
    country: raw.country || "Unknown",
    state: raw.state ?? "",
    budgetUsd,
    currency: "USD",
    deadline: raw.deadline,
    publicationDate: raw.publicationDate,
    source: raw.source,
    sourceType: raw.sourceType,
    category,
    serviceLine,
    fitScore: fitScoreFor({
      title: raw.title,
      description: raw.description,
      budgetUsd,
      country: raw.country,
      deadline: raw.deadline,
      // The classifier's verdict sets the capability base, so the score can
      // never disagree with the focus area the notice is filed under.
      serviceLine,
    }),
    projectType: PROJECT_TYPE_BY_SOURCE[raw.sourceType] ?? "Open Opportunity",
    technologies,
    tags,
    eligibility: "See the official notice for full eligibility criteria.",
    officialLink: raw.officialLink,
    contactName: contact?.name ?? null,
    contactEmail: contact?.email ?? null,
    contactPhone: contact?.phone ?? null,
    industry: "Public Sector",
  };
}
