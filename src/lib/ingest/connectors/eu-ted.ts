// EU TED (Tenders Electronic Daily) — the official EU public-procurement
// journal, covering all 27 member states (plus EEA). Public Search API v3,
// no key required. Notices are multilingual and use ISO country codes, so we
// normalize defensively and prefer English text where present.
import type { RawOpportunity } from "@/lib/ingest/normalize";

const SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";
const SOURCE = "EU TED";
const SOURCE_KEY = "eu-ted";

// TED uses 3-letter ISO country codes; map the common ones to display names.
const COUNTRY: Record<string, string> = {
  AUT: "Austria", BEL: "Belgium", BGR: "Bulgaria", HRV: "Croatia", CYP: "Cyprus",
  CZE: "Czechia", DNK: "Denmark", EST: "Estonia", FIN: "Finland", FRA: "France",
  DEU: "Germany", GRC: "Greece", HUN: "Hungary", IRL: "Ireland", ITA: "Italy",
  LVA: "Latvia", LTU: "Lithuania", LUX: "Luxembourg", MLT: "Malta", NLD: "Netherlands",
  POL: "Poland", PRT: "Portugal", ROU: "Romania", SVK: "Slovakia", SVN: "Slovenia",
  ESP: "Spain", SWE: "Sweden", NOR: "Norway", ISL: "Iceland", LIE: "Liechtenstein",
  CHE: "Switzerland", GBR: "United Kingdom",
};

type TedValue = string | string[] | Record<string, unknown> | undefined | null;

/** Extract English (or first available) text from TED's multilingual values. */
function pickText(v: TedValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    for (const item of v) {
      const t = pickText(item as TedValue);
      if (t) return t;
    }
    return "";
  }
  if (typeof v === "object") {
    for (const k of ["eng", "ENG", "en", "EN"]) {
      if (k in v) {
        const t = pickText((v as Record<string, TedValue>)[k]);
        if (t) return t;
      }
    }
    const first = Object.values(v)[0];
    return pickText(first as TedValue);
  }
  return String(v);
}

interface TedNotice {
  "publication-number"?: string;
  "notice-title"?: TedValue;
  "buyer-name"?: TedValue;
  "buyer-country"?: TedValue;
  "publication-date"?: string;
  "deadline-receipt-tender-date-lot"?: TedValue;
  links?: { html?: Record<string, string> };
}

function noticeLink(n: TedNotice): string {
  const pub = n["publication-number"];
  const html = n.links?.html;
  if (html) {
    const url = html.ENG ?? html.EN ?? Object.values(html)[0];
    if (url) return url;
  }
  return pub ? `https://ted.europa.eu/en/notice/${pub}/html` : "https://ted.europa.eu";
}

// CPV families to request from TED, each verified against the live API.
//
// Only narrow, domain-specific codes are used. The broad parents that used to
// be here — 72000000 (IT services), 48000000 (software packages), 32000000
// (radio/TV/telecom equipment) and 32500000 (telecom equipment & supplies) —
// were removed: TED notices carry several CPV codes each, so those families
// dragged in servers, medical devices and web design, and accounted for
// essentially all of the off-domain noise in the store.
//
// CPV still only narrows the funnel — a notice can carry a telecom code and be
// about something else entirely — so every record is re-checked locally by the
// domain gate in connectors/index.ts.
const CPV_TELECOM = [
  "32400000", // Networks
  "32520000", // Telecommunications cable and equipment
  "32562000", // Fibre optic cables
  "64200000", // Telecommunications services
  "45231600", // Construction work for communication lines
  "72700000", // Computer network services
];
// Geospatial families. Expanded from the original six after measuring the API:
// the six carried 47,140 notices, these carry 80,550, and the extra codes are
// all narrow and unambiguously geospatial (no broad IT parent is included).
const CPV_GEOSPATIAL = [
  "38221000", // Geographic information systems (GIS)
  "71354000", // Map-making services
  "71355000", // Surveying services
  "71353000", // Surface surveying services
  "71352000", // Subsurface surveying services
  "71351000", // Geological, geophysical and other prospecting services
  "71354100", // Digital mapping services
  "71354300", // Cadastral surveying services
  "71354500", // Marine survey services
  "71355100", // Photogrammetry services
  "71355200", // Ordnance surveying
  "71351200", // Geological and geophysical consultancy services
  "71351500", // Soil survey services
  "38290000", // Surveying, hydrographic, oceanographic instruments
  "38112100", // GPS / GNSS receivers
  "48326000", // Mapping software package
  "48326100", // Digital mapping systems
  "79961100", // Aerial photography services
];

// Search groups. GIS and telecom are queried SEPARATELY and each gets its own
// page budget. Previously a single combined query took one page of 120 sorted by
// publication date — and because the telecom families carry far more volume,
// they crowded GIS out almost entirely (17 GIS rows against 77 telecom). Giving
// each family its own budget is the single biggest lever on GIS coverage.
const GROUPS: { label: string; cpv: string[] }[] = [
  { label: "geospatial", cpv: CPV_GEOSPATIAL },
  { label: "telecom", cpv: CPV_TELECOM },
];

const PAGE_SIZE = 250; // TED's documented maximum; 500 is rejected with a 400.
const THROTTLE_MS = 1_200; // TED returns 429 on rapid sequential requests.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YYYYMMDD, the format TED's date comparisons expect. */
function tedDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * One page of results, retrying on 429 with exponential backoff.
 * Returns null when the page can't be fetched, so one bad page doesn't lose the
 * pages already collected.
 */
async function searchPage(
  query: string,
  page: number,
  attempt = 0,
): Promise<{ notices: TedNotice[]; total: number } | null> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query,
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "buyer-country",
        "publication-date",
        "deadline-receipt-tender-date-lot",
        "links",
      ],
      page,
      limit: PAGE_SIZE,
      scope: "ALL",
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });

  if (res.status === 429 && attempt < 3) {
    await sleep(2_000 * 2 ** attempt);
    return searchPage(query, page, attempt + 1);
  }
  if (!res.ok) {
    if (page === 1) throw new Error(`TED ${res.status}`); // first page failing is a real error
    return null; // a later page failing just ends pagination early
  }
  const body = (await res.json()) as { notices?: TedNotice[]; totalNoticeCount?: number };
  return { notices: body.notices ?? [], total: body.totalNoticeCount ?? 0 };
}

/**
 * Fetch every currently-open in-domain notice, per family group.
 *
 * The query filters on a FUTURE DEADLINE server-side
 * (`deadline-receipt-tender-date-lot >= today`). That is what makes real volume
 * affordable: unfiltered, the geospatial families hold ~47k notices of which
 * almost all are long closed, so fetching the newest 120 and discarding the
 * closed ones wasted nearly the whole budget. Filtered, the same families return
 * ~356 notices and every one is still open — so the page budget is spent only on
 * records that can actually reach the portal.
 *
 * Trade-off: notices with no deadline at all are not returned by this query.
 * Those are kept elsewhere in the pipeline (isOpenOpportunity accepts a missing
 * deadline if published within 180 days) but on TED they are a small minority,
 * and paying ~3,800 fetches to find them is not worth it.
 *
 * @param maxPerGroup Hard cap on notices per family group, so a growing feed can
 *                    never blow the cron's 300s budget.
 */
export async function fetchEuTed(maxPerGroup = 600): Promise<RawOpportunity[]> {
  const today = tedDate(new Date());
  const notices: TedNotice[] = [];
  // A notice carrying both a GIS and a telecom CPV code is returned by both
  // groups. The pipeline dedupes by id downstream too, but skipping it here
  // avoids normalizing the same notice twice.
  const seen = new Set<string>();

  for (const group of GROUPS) {
    const query =
      `classification-cpv IN (${group.cpv.join(" ")}) ` +
      `AND deadline-receipt-tender-date-lot>=${today} ` +
      `SORT BY publication-date DESC`;

    const maxPages = Math.ceil(maxPerGroup / PAGE_SIZE);
    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) await sleep(THROTTLE_MS);
      const result = await searchPage(query, page);
      if (!result || result.notices.length === 0) break;
      for (const n of result.notices) {
        const pub = n["publication-number"];
        if (!pub || seen.has(pub)) continue;
        seen.add(pub);
        notices.push(n);
      }
      // Stop as soon as we've seen everything the group holds.
      if (page * PAGE_SIZE >= result.total) break;
    }
    await sleep(THROTTLE_MS); // be a good citizen between groups
  }

  const out: RawOpportunity[] = [];
  for (const n of notices) {
    const pub = n["publication-number"];
    if (!pub) continue;
    const title = pickText(n["notice-title"]).replace(/\s+/g, " ").trim();
    const buyer = pickText(n["buyer-name"]).trim();
    const code = pickText(n["buyer-country"]).trim().toUpperCase();
    const country = COUNTRY[code] ?? (code || "European Union");
    const deadline = pickText(n["deadline-receipt-tender-date-lot"]).slice(0, 10) || null;
    const pubDate = (n["publication-date"] ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);

    out.push({
      sourceKey: SOURCE_KEY,
      source: SOURCE,
      sourceType: "Public Tender API",
      referenceNumber: pub,
      title: title || `EU tender notice ${pub}`,
      description: title, // TED search returns metadata, not the full body
      organization: buyer || "EU contracting authority",
      country,
      amount: null,
      currency: "EUR",
      deadline: deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      publicationDate: pubDate,
      officialLink: noticeLink(n),
      tags: ["EU", "TED"],
    });
  }
  return out;
}
