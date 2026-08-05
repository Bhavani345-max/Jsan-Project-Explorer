// ------------------------------------------------------------------
// Rule-based capability fit score.
//
// Every point this function awards is traceable to a named rule below. Given
// the same notice text, budget, country and deadline it returns the same score
// on every machine and every run — there is no model call, no network call and
// no randomness anywhere in this file. That is the whole point: when someone
// asks "why is this a 78?", the answer is the returned breakdown, not a guess.
//
// The breakdown travels with the score so the detail page can render the exact
// arithmetic (see components/FitBreakdown and app/projects/[id]).
//
// ---- what the number means ----------------------------------------
// The score answers ONE question: how well does this notice match what JSAN
// actually delivers? It is dominated by capability, not by commercial
// circumstance. That is a deliberate change from the first rubric, which
// awarded a flat +30 for "GIS" and then leaned on budget and country — and
// because most TED notices disclose no budget and sit outside the priority
// list, nothing could clear 50. The board topped out at 2 rows above 70 out of
// 790, which made a "high fit" filter meaningless.
//
// Now the assigned focus area sets the base (a core geospatial or telecom
// notice starts at 50+), depth and breadth of capability evidence carry it into
// the 70s, and budget/country/deadline are the last ~25 points rather than the
// deciding ones. Measured over 522 stored in-domain rows this produces:
//
//     20–29   2 | 30–39  15 | 40–49  28 | 50–59  73
//     60–69 130 | 70–79 132 | 80–89  13
//
// ~37% at or above 70, which is a usable recommended board rather than a
// rounding error. Re-measure after any change to this table:
//   curl "<host>/api/cron/reclassify?dryRun=1&key=$CRON_SECRET" | jq .scoreHistogram
// ------------------------------------------------------------------
import {
  TARGET_MIN_BUDGET_USD,
  TARGET_MAX_BUDGET_USD,
  PRIORITY_COUNTRIES,
  DEADLINE_SOON_DAYS,
} from "@/lib/domain";
import { isGoodsProcurement } from "@/lib/ingest/goods";
import type { ServiceLine } from "@/lib/types";

/** One rule's contribution. `points` is what it awarded, `max` what it could. */
export interface FitRuleHit {
  id: string;
  label: string;
  /** Points actually awarded by this rule. */
  points: number;
  /** Points this rule could have awarded. */
  max: number;
  matched: boolean;
  /** What in the record triggered the rule — the citation for the points. */
  evidence?: string;
}

export interface FitBreakdown {
  /** 0–100, the value stored on the record and shown in the UI. */
  score: number;
  /** Points actually awarded, before the 100 ceiling. */
  awarded: number;
  /** Points available if every rule fired at full value. */
  available: number;
  /** True when `awarded` exceeded 100 and the score was capped. */
  capped: boolean;
  /** True when the notice was disqualified outright (goods purchase). */
  disqualified: boolean;
  rules: FitRuleHit[];
}

export interface FitInput {
  title: string;
  description?: string | null;
  budgetUsd?: number | null;
  country?: string | null;
  /** ISO date. Blank/absent simply means the deadline rule cannot fire. */
  deadline?: string | null;
  /** The focus area the classifier assigned. Sets the capability base. */
  serviceLine?: ServiceLine | string | null;
}

// ---- capability base ------------------------------------------------
// One number per focus area, in JSAN's own priority order. The classifier in
// lib/ingest/normalize.ts has already decided WHICH capability a notice is;
// this decides how much that is worth before any evidence is weighed.
//
// Digital Engineering sits far below the rest on purpose: the brief qualifies
// it as "where linked to JSAN delivery capability", i.e. supporting work, not a
// pursuit target in its own right. It therefore cannot reach the recommended
// threshold on capability alone.
const CAPABILITY_BASE: Record<string, number> = {
  "Geospatial Intelligence": 52,
  "Telecom & Network Engineering": 50,
  "Geospatial & Telecom Adjacent": 42,
  "Strategic Workforce Solutions": 40,
  "Structured Program Management": 40,
  "Digital Engineering": 28,
  "Out of Scope": 0,
};

const MAX_CAPABILITY_BASE = 52;

// ---- capability vocabulary -----------------------------------------
// Used to measure how MUCH capability evidence a title carries, not to decide
// which line it belongs to (normalize.ts owns that). Grouped by family so a
// notice touching two families — "telecom GIS", a JSAN speciality — is visibly
// stronger than one touching a single term.
const CAPABILITY_FAMILIES: { id: string; label: string; pattern: RegExp }[] = [
  {
    id: "gis",
    label: "geospatial",
    pattern:
      /\bgis\b|geospatial|geographic information|geodetic|geodesy|cartograph\w*|cadastr\w*|topograph\w*|land registry|land administration|orthophoto|spatial data|arcgis|\bqgis\b|lidar|remote sensing|earth observation|satellite imagery|photogrammetr\w*|\bgnss\b|hydrographic|aerial survey|\bmapping\b|survey(?:ing|s)?\b/gi,
  },
  {
    id: "telecom",
    label: "telecom / network",
    pattern:
      /telecom\w*|\b5g\b|\b4g\b|\blte\b|fibre|fiber optic\w*|\bfttx\b|\bfttp\b|\bftth\b|broadband|oss\/bss|radio (?:access|network)|base station|backhaul|antenna\w*|structured cabling|network (?:engineering|design|planning|infrastructure)|dark fib|local loop|outside plant|fielding|as-?built|make-?ready|pole attachment|close-?out|data transmission|telephone/gi,
  },
  {
    id: "adjacent",
    label: "adjacent (IoT / SCADA / digital twin)",
    pattern:
      /digital twin|\biot\b|internet of things|sensor network|telemetry|\bscada\b|\bdrone\b|\buav\b|unmanned aerial|smart cit\w*|spatial data infrastructure|geo-?portal|geoinformation|land information system|spectrum management|emergency communication|public safety network|\btetra\b|digital infrastructure|national broadband/gi,
  },
  {
    id: "workforce",
    label: "workforce / resourcing",
    pattern:
      /staff(?:ing|s)?\b|workforce|resourcing|recruitment|managed service|staff augmentation|specialist delivery|delivery capacity|secondment|contingent labour|talent (?:acquisition|supply)/gi,
  },
  {
    id: "programme",
    label: "programme management / PMO",
    pattern:
      /programme management|program management|\bpmo\b|prince2|project management office|programme office|delivery assurance|portfolio management|(?:programme|project|delivery) governance|quality control|multi-?country (?:delivery|execution)/gi,
  },
  {
    id: "digital",
    label: "digital engineering",
    pattern:
      /cloud migration|\bcloud\b|\baws\b|\bazure\b|data engineering|data platform|data warehouse|data lake|web (?:application|platform|development)|mobile app|enterprise software|\berp\b|\bcrm\b|cyber ?security|information security|system integration/gi,
  },
];

/** CPV service categories that are themselves a JSAN capability. */
const CAPABILITY_CPV =
  /\b(?:topograph|cadastr|survey|mapping|geographic information|photogrammetr|geodet|hydrograph|telecommunication|telephone|data transmission|network|radio|broadcast)\w*/i;
const SERVICE_CPV = /\bservices?\b/i;

const DEPTH_MAX = 18;
const DEPTH_PER_TERM = 6;
const BREADTH_MAX = 10;
const BREADTH_PER_FAMILY = 6;
const CPV_POINTS = 8;
const BUDGET_POINTS = 12;
const BUDGET_DISCLOSED_POINTS = 3;
const COUNTRY_POINTS = 8;
const DEADLINE_POINTS = 5;
const DEADLINE_NEAR_POINTS = 3;
const DEADLINE_NEAR_DAYS = 90;

/** Points available if every rule fired at full value. */
export const MAX_AVAILABLE_POINTS =
  MAX_CAPABILITY_BASE + DEPTH_MAX + BREADTH_MAX + CPV_POINTS +
  BUDGET_POINTS + COUNTRY_POINTS + DEADLINE_POINTS;

/** Unique, human-readable list of what a pattern actually matched. */
function evidenceFor(pattern: RegExp, text: string): string[] {
  // Fresh regex per call: the module-level patterns carry /g, and a shared
  // lastIndex across calls would make matching depend on call order.
  const re = new RegExp(pattern.source, pattern.flags);
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const term = m[0].trim().toLowerCase();
    if (term) seen.add(term);
    if (seen.size >= 5) break;
  }
  return [...seen];
}

function cpvLabel(title: string): string {
  const parts = title.split(/\s[–—-]\s/);
  return parts.length >= 3 ? parts[1].trim() : "";
}

/** Whole days from today (UTC) until `iso`, or null when it is not a date. */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((t - todayUtc) / 86_400_000);
}

/**
 * Score one opportunity 0–100 and explain it.
 *
 * The total is capped at 100 rather than divided by MAX_AVAILABLE_POINTS: the
 * rule table says "geospatial base 52", and scaling would quietly turn that
 * into 40. A cap keeps every published weight literally true.
 */
export function scoreFit(input: FitInput): FitBreakdown {
  const title = input.title ?? "";
  const text = `${title} ${input.description ?? ""}`;
  const rules: FitRuleHit[] = [];

  // ---- disqualifier ----------------------------------------------
  // A purchase of product is not a capability match at any score. This mirrors
  // the ingest and read gates so a goods notice that somehow reaches the UI
  // still reads as zero rather than as a mid-table opportunity.
  if (isGoodsProcurement(title)) {
    return {
      score: 0,
      awarded: 0,
      available: MAX_AVAILABLE_POINTS,
      capped: false,
      disqualified: true,
      rules: [
        {
          id: "goods",
          label: "Not a goods or supply purchase",
          points: 0,
          max: 0,
          matched: false,
          evidence: "this notice is a purchase of product, which JSAN does not bid",
        },
      ],
    };
  }

  // ---- capability base -------------------------------------------
  const line = (input.serviceLine ?? "") as string;
  const base = CAPABILITY_BASE[line];
  // Where no line travelled with the input (legacy callers), fall back to the
  // strongest family present in the title so a score is still produced.
  const familyHits = CAPABILITY_FAMILIES.map((f) => ({
    ...f,
    terms: evidenceFor(f.pattern, title),
  }));
  const strongest = [...familyHits].sort((a, b) => b.terms.length - a.terms.length)[0];
  const resolvedBase =
    base != null
      ? base
      : strongest && strongest.terms.length
        ? CAPABILITY_BASE[
            strongest.id === "gis" ? "Geospatial Intelligence"
              : strongest.id === "telecom" ? "Telecom & Network Engineering"
              : strongest.id === "adjacent" ? "Geospatial & Telecom Adjacent"
              : strongest.id === "workforce" ? "Strategic Workforce Solutions"
              : strongest.id === "programme" ? "Structured Program Management"
              : "Digital Engineering"
          ]
        : 0;

  rules.push({
    id: "capability",
    label: "Capability focus area",
    points: resolvedBase,
    max: MAX_CAPABILITY_BASE,
    matched: resolvedBase > 0,
    evidence: line || (strongest?.terms.length ? strongest.label : "no focus area matched"),
  });

  // ---- depth: how much capability vocabulary the title carries ----
  const topTerms = strongest?.terms ?? [];
  const depth = Math.min(DEPTH_MAX, Math.max(0, topTerms.length - 1) * DEPTH_PER_TERM);
  rules.push({
    id: "depth",
    label: "Depth of capability evidence in the title",
    points: depth,
    max: DEPTH_MAX,
    matched: depth > 0,
    evidence: topTerms.length ? topTerms.join(", ") : "one or no capability term",
  });

  // ---- breadth: more than one capability family ------------------
  const families = familyHits.filter((f) => f.terms.length > 0);
  const breadth = Math.min(BREADTH_MAX, Math.max(0, families.length - 1) * BREADTH_PER_FAMILY);
  rules.push({
    id: "breadth",
    label: "Spans more than one capability",
    points: breadth,
    max: BREADTH_MAX,
    matched: breadth > 0,
    evidence: families.length > 1 ? families.map((f) => f.label).join(" + ") : "single capability",
  });

  // ---- the buyer's own procurement category ----------------------
  const label = cpvLabel(title);
  const cpvMatched = Boolean(label) && SERVICE_CPV.test(label) && CAPABILITY_CPV.test(label);
  rules.push({
    id: "cpv",
    label: "Published under a capability service category",
    points: cpvMatched ? CPV_POINTS : 0,
    max: CPV_POINTS,
    matched: cpvMatched,
    evidence: label || "no procurement category published",
  });

  // ---- commercial signals ----------------------------------------
  const budget = input.budgetUsd;
  const inBand =
    budget != null && budget >= TARGET_MIN_BUDGET_USD && budget <= TARGET_MAX_BUDGET_USD;
  const budgetPoints = inBand ? BUDGET_POINTS : budget != null ? BUDGET_DISCLOSED_POINTS : 0;
  rules.push({
    id: "budget",
    label: "Budget in the $1–10M band",
    points: budgetPoints,
    max: BUDGET_POINTS,
    matched: budgetPoints > 0,
    evidence: inBand
      ? `$${(budget! / 1_000_000).toFixed(1)}M disclosed`
      : budget == null
        ? "no budget disclosed"
        : `$${(budget / 1_000_000).toFixed(1)}M is outside the band`,
  });

  const country = (input.country ?? "").trim();
  const countryMatched = PRIORITY_COUNTRIES.some(
    (c) => c.toLowerCase() === country.toLowerCase(),
  );
  rules.push({
    id: "country",
    label: "Priority country",
    points: countryMatched ? COUNTRY_POINTS : 0,
    max: COUNTRY_POINTS,
    matched: countryMatched,
    evidence: country || undefined,
  });

  const days = daysUntil(input.deadline);
  const deadlinePoints =
    days == null || days < 0
      ? 0
      : days <= DEADLINE_SOON_DAYS
        ? DEADLINE_POINTS
        : days <= DEADLINE_NEAR_DAYS
          ? DEADLINE_NEAR_POINTS
          : 0;
  rules.push({
    id: "deadline",
    label: `Deadline within ${DEADLINE_SOON_DAYS} days`,
    points: deadlinePoints,
    max: DEADLINE_POINTS,
    matched: deadlinePoints > 0,
    evidence:
      days == null
        ? "no deadline listed"
        : days < 0
          ? "deadline passed"
          : `${days} day${days === 1 ? "" : "s"} left`,
  });

  const awarded = rules.reduce((sum, r) => sum + r.points, 0);
  return {
    score: Math.min(100, awarded),
    awarded,
    available: MAX_AVAILABLE_POINTS,
    capped: awarded > 100,
    disqualified: false,
    rules,
  };
}

/** Score only, for the ingest and reclassify paths that store a bare number. */
export function fitScoreFor(input: FitInput): number {
  return scoreFit(input).score;
}
