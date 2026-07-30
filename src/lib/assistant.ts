// ------------------------------------------------------------------
// JSAN Discovery Assistant — a deterministic natural-language matcher.
//
// Turns a plain-English request ("open GIS tenders in the UK under $5M,
// best fit for us") into a structured query over the opportunity data and
// returns ranked matches plus a written answer. It runs entirely on the
// repository (no external API) so it is always available and its answers are
// exactly consistent with what the Explorer shows. If an OpenRouter key is
// configured the answer wording can be enriched upstream, but matching never
// depends on it.
// ------------------------------------------------------------------
import { PROJECTS } from "./seed";
import { facets, queryProjects } from "./repository";
import { money } from "./format";
import type { Project, ProjectQuery } from "./types";

export interface AssistantResult {
  answer: string;
  projects: Project[];
  // Structured filters, for deep-linking the request into the Explorer.
  filters: Record<string, string>;
  understood: string[];
  // True only when the user is actually looking for opportunities (not asking
  // a general/knowledge question that merely mentions a keyword like "GIS").
  isSearch: boolean;
}

// Signals that the user wants to *search opportunities* vs. asking a general
// knowledge/writing question. We only surface opportunity results when the
// search intent genuinely outweighs the knowledge intent.
const SEARCH_SIGNALS: RegExp[] = [
  /\bfind\b/, /\bsearch\b/, /\bshow\b/, /\blist\b/, /\bbrowse\b/, /\bsurface\b/,
  /opportunit/, /\btender/, /\brfp\b/, /\brfq\b/, /procure/, /solicitation/,
  /\bbid\b/, /\bcontract/, /\bproject/, /\bpipeline\b/, /\blead\b/, /\bdeal\b/,
  /best fit/, /closing soon/,
];
const KNOWLEDGE_SIGNALS: RegExp[] = [
  /^\s*(what|who|why|how|when|where|which)\b/, /what('s| is| are)\b/,
  /\bexplain\b/, /\bdefine\b/, /\bdefinition\b/, /\bdescribe\b/, /tell me about/,
  /\bmeaning\b/, /difference between/, /\bcompare\b/, /\bvs\.?\b/, /\bwrite\b/,
  /\bdraft\b/, /\bcompose\b/, /\bcreate\b/, /\bgenerate\b/, /\bmake\b/, /\bsummar/,
  /pros and cons/, /\bexample/, /how to/, /step[- ]by[- ]step/, /\bteach\b/,
];

/** Does this message want an opportunity search (vs. a general answer)? */
export function isOpportunityQuery(message: string): boolean {
  const m = message.toLowerCase();
  const s = SEARCH_SIGNALS.reduce((n, re) => n + (re.test(m) ? 1 : 0), 0);
  const k = KNOWLEDGE_SIGNALS.reduce((n, re) => n + (re.test(m) ? 1 : 0), 0);
  return s > k;
}

// Deliberately no bare "us" alias — it collides with "for us" / "show us".
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "United Kingdom",
  britain: "United Kingdom",
  usa: "United States",
  america: "United States",
  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
};

const SERVICE_LINE_KEYWORDS: { re: RegExp; line: string }[] = [
  { re: /\bgis\b|geospatial|geospacial|mapping|spatial|cartograph/i, line: "Geospatial Intelligence" },
  { re: /telecom|telecoms|fibre|fiber|5g|broadband|\brf\b|gsm|network engineering/i, line: "Telecom & Network Engineering" },
  { re: /adjacent|related work|earth observation|digital twin|smart cit|\biot\b|internet of things|\bscada\b|sensor network/i, line: "Geospatial & Telecom Adjacent" },
  { re: /programme management|program management|\bpmo\b/i, line: "Structured Program Management" },
  { re: /workforce|staffing|resourcing|recruitment/i, line: "Strategic Workforce Solutions" },
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "our", "we", "us", "in", "on", "of", "to",
  "find", "show", "get", "me", "any", "all", "that", "are", "is", "some", "please", "need",
  "want", "looking", "look", "project", "projects", "opportunity", "opportunities", "tender",
  "tenders", "related", "relevant", "best", "good", "fit", "under", "over", "above", "below",
  "less", "more", "than", "still", "open", "available", "which", "what", "can", "do", "give",
]);

function parseBudget(msg: string): { minBudget?: number; maxBudget?: number; label?: string } {
  // e.g. "under $5m", "over 2 million", "below 800k", "at least $1m"
  const m = msg.match(/(under|below|less than|up to|over|above|more than|at least|greater than|min(?:imum)?|max(?:imum)?)\s*\$?\s*([\d.]+)\s*(k|m|million|thousand)?/i);
  if (!m) return {};
  const dir = m[1].toLowerCase();
  const n = parseFloat(m[2]);
  const unit = (m[3] || "").toLowerCase();
  const mult = unit.startsWith("m") || unit === "million" ? 1_000_000 : unit.startsWith("k") || unit === "thousand" ? 1_000 : 1;
  const value = Math.round(n * mult);
  const isMax = /under|below|less|up to|max/.test(dir);
  return isMax
    ? { maxBudget: value, label: `budget under ${money(value)}` }
    : { minBudget: value, label: `budget over ${money(value)}` };
}

export function runAssistant(message: string): AssistantResult {
  const raw = message.trim();
  const msg = raw.toLowerCase();

  // Knowledge/writing questions are handled by the language model, not the
  // opportunity matcher — return nothing so no opportunity cards are attached.
  if (!isOpportunityQuery(raw)) {
    return { answer: "", projects: [], filters: {}, understood: [], isSearch: false };
  }

  const f = facets();
  const understood: string[] = [];
  const query: ProjectQuery = { sort: "fitScore", pageSize: 60, page: 1 };
  const filters: Record<string, string> = {};

  // --- technology ---
  const tech = f.technologies.find((t) => {
    const re = new RegExp(`(^|[^a-z0-9])${t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    return re.test(msg);
  });
  if (tech) {
    query.technology = tech;
    filters.technology = tech;
    understood.push(`technology “${tech}”`);
  }

  // --- service line (JSAN pillar) ---
  const sl = SERVICE_LINE_KEYWORDS.find((k) => k.re.test(msg));
  if (sl) {
    query.serviceLine = sl.line;
    filters.serviceLine = sl.line;
    understood.push(sl.line);
  }

  // --- country ---
  let country = f.countries.find((c) => msg.includes(c.toLowerCase()));
  if (!country) {
    for (const [alias, full] of Object.entries(COUNTRY_ALIASES)) {
      if (new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i").test(msg)) {
        country = full;
        break;
      }
    }
  }
  if (country) {
    query.country = country;
    filters.country = country;
    understood.push(country);
  }

  // --- budget ---
  const budget = parseBudget(msg);
  if (budget.minBudget != null) {
    query.minBudget = budget.minBudget;
    filters.minBudget = String(budget.minBudget);
  }
  if (budget.maxBudget != null) {
    query.maxBudget = budget.maxBudget;
    filters.maxBudget = String(budget.maxBudget);
  }
  if (budget.label) understood.push(budget.label);

  // --- capability fit / core strength ---
  if (/best fit|good fit|strong(est)?|core|our strength|high fit|top pick|most relevant/.test(msg)) {
    query.minFit = 85;
    query.sort = "fitScore";
    filters.minFit = "85";
    understood.push("high capability fit (≥85%)");
  }

  // --- urgency ---
  if (/urgent|closing soon|closing|deadline|this week|soon|expiring/.test(msg)) {
    query.sort = "deadline";
    understood.push("closing soonest");
  }

  // --- availability (default: only pursuable work) ---
  if (/occupied|awarded|closed|taken|include closed|all statuses|everything/.test(msg)) {
    query.availableOnly = false;
    understood.push("including occupied");
  } else {
    query.availableOnly = true;
    filters.availableOnly = "true";
  }

  // --- run the structured query, then keyword re-rank for tie-breaks ---
  const constrained = queryProjects({ ...query, pageSize: 200 }).items;

  const tokens = msg
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const scored = constrained
    .map((p) => {
      const hay = [p.title, p.description, p.organization, p.country, ...p.technologies, ...p.tags]
        .join(" ")
        .toLowerCase();
      const kw = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
      return { p, kw };
    })
    .sort((a, b) => b.kw - a.kw || b.p.fitScore - a.p.fitScore);

  const projects = scored.slice(0, 6).map((s) => s.p);

  return {
    answer: composeAnswer(raw, projects, understood, constrained.length),
    projects,
    filters,
    understood,
    isSearch: true,
  };
}

function composeAnswer(
  raw: string,
  projects: Project[],
  understood: string[],
  total: number,
): string {
  if (projects.length === 0) {
    return `I couldn't find opportunities matching that. Try widening the request — for example drop the budget limit or a specific technology. You can also browse everything in the Explorer.`;
  }
  const crit = understood.length ? ` matching ${understood.join(" · ")}` : "";
  const top = projects[0];
  const more = total > projects.length ? ` Showing the top ${projects.length} of ${total}.` : "";
  return (
    `Found ${total} pursuable ${total === 1 ? "opportunity" : "opportunities"}${crit}. ` +
    `Top pick: “${top.title}” — ${top.organization}, ${top.country}, ${money(top.budget)}, ` +
    `${top.fitScore}% JSAN fit.${more}`
  );
}

// Seed prompts surfaced in the assistant UI.
export const ASSISTANT_SUGGESTIONS = [
  "Open GIS opportunities best fit for us",
  "Telecom & 5G tenders in the UK under $6M",
  "Highest-value projects closing soon",
  "Smart city and IoT projects worldwide",
];
