// ------------------------------------------------------------------
// Rule-based capability fit score.
//
// Every point this function awards is traceable to a named rule below. Given
// the same notice text, budget, country and deadline it returns the same score
// on every machine and every run — there is no model call, no network call and
// no randomness anywhere in this file. That is the whole point: when someone
// asks "why is this a 75?", the answer is the returned breakdown, not a guess.
//
// The breakdown travels with the score so the detail page can render the exact
// arithmetic (see components/FitBreakdown and app/projects/[id]).
// ------------------------------------------------------------------
import {
  TARGET_MIN_BUDGET_USD,
  TARGET_MAX_BUDGET_USD,
  PRIORITY_COUNTRIES,
  DEADLINE_SOON_DAYS,
} from "@/lib/domain";

/** One rule's contribution to a score. `matched` false means it scored zero. */
export interface FitRuleHit {
  id: string;
  label: string;
  points: number;
  matched: boolean;
  /** What in the record triggered the rule — the citation for the points. */
  evidence?: string;
}

export interface FitBreakdown {
  /** 0–100, the value stored on the record and shown in the UI. */
  score: number;
  /** Points actually awarded, before the 100 ceiling. */
  awarded: number;
  /** Points available if every rule fired — never reachable in practice. */
  available: number;
  /** True when `awarded` exceeded 100 and the score was capped. */
  capped: boolean;
  rules: FitRuleHit[];
}

export interface FitInput {
  title: string;
  description?: string | null;
  budgetUsd?: number | null;
  country?: string | null;
  /** ISO date. Blank/absent simply means the deadline rule cannot fire. */
  deadline?: string | null;
}

// ---- keyword rules -------------------------------------------------
// Ordered by weight, which is also the order they read in the UI. Patterns are
// deliberately explicit rather than clever: this table IS the specification, so
// it has to stay readable by whoever is asked to defend a score.
//
// The first five weights (GIS 30, telecom 25, utilities 20, smart city 20,
// cloud 15) are the ones handed down with the requirements. Workforce and
// programme management were added when the portal began surfacing all six
// capability focus areas: without a rule of their own, a staffing or PMO notice
// scores near zero and sinks to the bottom of the default fit ranking, so those
// two lines would have been visible in the filters and invisible in practice.
interface KeywordRule {
  id: string;
  label: string;
  points: number;
  pattern: RegExp;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    id: "gis",
    label: "GIS / geospatial",
    points: 30,
    pattern:
      /\bgis\b|geospatial|geographic information|geodetic|geodesy|cartograph\w*|cadastr\w*|topograph\w*|land registry|land administration|\bmapping\b|\bmaps?\b|survey(?:ing|s)?\b|orthophoto|spatial data|arcgis|\bqgis\b|lidar|remote sensing|earth observation|satellite imagery|photogrammetr\w*|\bgnss\b|hydrographic/gi,
  },
  {
    id: "telecom",
    label: "Telecom / network engineering",
    points: 25,
    pattern:
      /telecom\w*|telephon\w*|\bnetworks?\b|\b5g\b|\b4g\b|\blte\b|fibre|fiber optic\w*|\bfttx\b|\bfttp\b|\bftth\b|broadband|oss\/bss|\brf planning\b|radio (?:access|equipment|network)|base station|backhaul|transceiver|antenna\w*|\bducting\b|cabling|transmission (?:services|network|equipment)|broadcast\w*|fielding|as-?built|make-?ready|outside plant|pole attachment|permit acquisition|close-?out/gi,
  },
  {
    id: "utilities",
    label: "Utilities",
    points: 20,
    pattern:
      /\butilit(?:y|ies)\b|water network|wastewater|power grid|electricity (?:network|distribution)|substation|gas network|pipeline network|energy distribution|district heating|\bmeter(?:ing)?\b/gi,
  },
  {
    id: "smart-city",
    label: "Smart city",
    points: 20,
    pattern:
      /smart cit(?:y|ies)|intelligent transport|urban mobility|urban platform|digital twin|traffic management|street lighting|\bsmart grid\b/gi,
  },
  {
    id: "workforce",
    label: "Workforce / resourcing",
    points: 15,
    pattern:
      /staff(?:ing|s)?|workforce|resourcing|recruitment|managed service|staff augmentation|specialist delivery|delivery capacity|secondment|contingent labour/gi,
  },
  {
    id: "programme",
    label: "Programme management / PMO",
    points: 15,
    pattern:
      /programme management|program management|pmo|p3o|prince2|project management office|programme office|delivery assurance|portfolio management|(?:programme|project|delivery) governance|multi-?country (?:delivery|execution|programme|program)/gi,
  },
  {
    id: "cloud",
    label: "Cloud / platform",
    points: 15,
    pattern:
      /\bcloud\b|\baws\b|amazon web services|\bazure\b|google cloud|\bgcp\b|kubernetes|\bsaas\b|\bpaas\b|\biaas\b|data cent(?:er|re)|hosting|\bservers?\b|virtualisation|virtualization|storage (?:system|solution)/gi,
  },
];

/** Unique, human-readable list of what a pattern actually matched. */
function evidenceFor(pattern: RegExp, text: string): string[] {
  // Fresh regex per call: the module-level patterns carry /g, and a shared
  // lastIndex across calls would make matching depend on call order.
  const re = new RegExp(pattern.source, pattern.flags);
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const term = m[0].trim().toLowerCase();
    if (term) seen.add(term);
    if (seen.size >= 4) break; // enough to justify the points
  }
  return [...seen];
}

/** Points available if every rule fired. Exported for the UI's "of N" label. */
export const MAX_AVAILABLE_POINTS =
  KEYWORD_RULES.reduce((sum, r) => sum + r.points, 0) + 15 + 10 + 5;

/**
 * Score one opportunity 0–100 and explain it.
 *
 * The total is capped at 100 rather than divided by MAX_AVAILABLE_POINTS: the
 * rule table says "GIS +30", and scaling would quietly turn that into +21. A
 * cap keeps every published weight literally true, at the cost of flattening
 * the handful of records that match almost everything.
 */
export function scoreFit(input: FitInput): FitBreakdown {
  const text = `${input.title ?? ""} ${input.description ?? ""}`;
  const rules: FitRuleHit[] = [];

  for (const rule of KEYWORD_RULES) {
    const hits = evidenceFor(rule.pattern, text);
    rules.push({
      id: rule.id,
      label: rule.label,
      points: rule.points,
      matched: hits.length > 0,
      evidence: hits.length ? hits.join(", ") : undefined,
    });
  }

  // Budget inside the pursuit band. An undisclosed budget cannot match — it is
  // not evidence of anything, and guessing would be the sort of inference this
  // score exists to avoid.
  const budget = input.budgetUsd;
  const budgetMatched =
    budget != null && budget >= TARGET_MIN_BUDGET_USD && budget <= TARGET_MAX_BUDGET_USD;
  rules.push({
    id: "budget",
    label: `Budget in the $1–10M band`,
    points: 15,
    matched: budgetMatched,
    evidence: budgetMatched
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
    points: 10,
    matched: countryMatched,
    evidence: country || undefined,
  });

  // Deadline near enough to still be worth mobilising for. A deadline already
  // in the past scores nothing.
  const days = daysUntil(input.deadline);
  const deadlineMatched = days != null && days >= 0 && days <= DEADLINE_SOON_DAYS;
  rules.push({
    id: "deadline",
    label: `Deadline within ${DEADLINE_SOON_DAYS} days`,
    points: 5,
    matched: deadlineMatched,
    evidence:
      days == null
        ? "no deadline listed"
        : days < 0
          ? "deadline passed"
          : `${days} day${days === 1 ? "" : "s"} left`,
  });

  const awarded = rules.reduce((sum, r) => sum + (r.matched ? r.points : 0), 0);
  return {
    score: Math.min(100, awarded),
    awarded,
    available: MAX_AVAILABLE_POINTS,
    capped: awarded > 100,
    rules,
  };
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

/** Score only, for the ingest and reclassify paths that store a bare number. */
export function fitScoreFor(input: FitInput): number {
  return scoreFit(input).score;
}
