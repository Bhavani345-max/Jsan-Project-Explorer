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
  // What KIND of notice this is: "competition" is a live invitation to bid,
  // "result" announces who already won it. See isStillOpenForBids().
  "form-type"?: TedValue;
  "winner-name"?: TedValue;
  // Contract value. "total-value" is a plain number; "estimated-value-lot" is
  // an array of numeric strings, one per lot. See noticeValue().
  "total-value"?: TedValue | number;
  "total-value-cur"?: TedValue;
  "estimated-value-lot"?: TedValue;
  "estimated-value-cur-lot"?: TedValue;
  links?: { html?: Record<string, string> };
}

/**
 * Is this notice still open for bids, or has the contract already been bought?
 *
 * TED publishes the whole lifecycle of a contract under the same CPV codes, and
 * only the first stage is biddable. Measured over 250 notices in the geospatial
 * families with no deadline filter applied: 132 "competition" (a live call for
 * tenders), 86 "result" (a contract award notice — someone has already won it,
 * and 76 of them name the winner), 26 "cont-modif" (a change to a contract
 * already awarded), 5 "planning" (a prior information notice, not yet open) and
 * 1 "dir-awa-pre" (notice of intent to award directly, without a competition).
 *
 * Only "competition" is something a bidder can still act on, so only
 * "competition" is kept. The future-deadline filter in the query already
 * excludes almost all of the rest as a side effect — every one of the 250
 * notices it returned was a competition — but that is incidental, not a
 * guarantee: it holds only because award notices rarely carry a future
 * submission deadline. Asking the question directly is what makes "nothing
 * already awarded reaches the portal" a property of this connector rather than
 * a lucky consequence of a date comparison. A named winner is checked too, as a
 * second, independent signal that the contract is gone.
 */
function isStillOpenForBids(n: TedNotice): boolean {
  if (pickText(n["winner-name"]).trim()) return false;
  return pickText(n["form-type"]).trim().toLowerCase() === "competition";
}

// Below this, a "value" is a placeholder rather than a contract price. TED
// notices occasionally carry a token total (1, or a single currency unit) where
// the buyer had to supply the field but did not want to publish a figure.
const MIN_PLAUSIBLE_VALUE = 1_000;

/** Sum a TED money field: a bare number, a numeric string, or an array of them. */
function sumValues(v: TedValue | number | undefined): number | null {
  if (v == null) return null;
  const parts = Array.isArray(v) ? v : [v];
  let total = 0;
  let counted = 0;
  for (const part of parts) {
    if (part == null || typeof part === "object") continue;
    const n = Number(part);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n;
    counted++;
  }
  return counted ? total : null;
}

/**
 * The single currency a money field is quoted in, or null if it is ambiguous.
 *
 * TED returns currency as an ARRAY (`["EUR"]`) because a notice can price its
 * lots in different currencies. When it names more than one, the lot figures
 * cannot be added up into a single number and the value is treated as
 * unpublished — adding EUR to RON and labelling the result EUR would invent a
 * figure, and the board would then show that invention as a contract value.
 */
function currencyOf(v: TedValue): string | null {
  if (v == null) return null;
  const parts = Array.isArray(v) ? v : [v];
  const codes = new Set<string>();
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const code = part.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) codes.add(code);
  }
  return codes.size === 1 ? [...codes][0] : null;
}

/**
 * The published contract value, in the currency the buyer published it in.
 *
 * Prefers "total-value", which TED already computes across the lots: checked
 * against a live 69-lot notice, its total-value of 25,364,944 was the sum of
 * the lot array to the euro. "estimated-value-lot" is the fallback for the
 * notices that carry lots but no total (27 of 458 valued notices measured), and
 * it is also what rescues a notice whose total is a placeholder.
 *
 * Returns null when nothing trustworthy is published, which is the normal case:
 * 50% of open notices in these families publish no value at all. Null means
 * "undisclosed", and an undisclosed notice is kept in the table but stays off
 * the board — it is never guessed at.
 */
function noticeValue(n: TedNotice): { amount: number; currency: string } | null {
  const totalCurrency = currencyOf(n["total-value-cur"]);
  const lotCurrency = currencyOf(n["estimated-value-cur-lot"]);

  const total = sumValues(n["total-value"]);
  const currency = totalCurrency ?? lotCurrency;
  if (total != null && total >= MIN_PLAUSIBLE_VALUE && currency) {
    return { amount: total, currency };
  }

  const lots = sumValues(n["estimated-value-lot"]);
  const fallbackCurrency = lotCurrency ?? totalCurrency;
  if (lots != null && lots >= MIN_PLAUSIBLE_VALUE && fallbackCurrency) {
    return { amount: lots, currency: fallbackCurrency };
  }

  return null;
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

// Utility network intelligence is asked for by TEXT, not by CPV.
//
// The obvious CPV route does not work. The utility families — 65300000
// (electricity distribution), 65100000 (water distribution), 65200000 (gas
// distribution), 65500000 (meter reading) — were each measured against the live
// API and carry almost nothing but commodity supply: of 193 open notices across
// the four, the classifier passed one. 90491000 (sewer survey services) looked
// promising at 6 of 19 until the titles were read — it is CCTV pipe inspection
// ("Kamerauntersuchung der Grundstücksentwässerungsanlagen"), a different
// trade. Paging those families would spend the cron budget to collect noise.
//
// TED's expert query supports full text (`FT=`), so the work can be asked for
// directly instead: a distribution network AND something done to its asset
// data. That is the same two-part test the classifier applies, pushed to the
// server so only a handful of notices come back — 9 open on the run that sized
// this, against the 193 the CPV route would have paged through.
const UTILITY_SECTOR_FT =
  '("utility network" OR "utility networks" OR "utility asset" OR "electricity network" OR ' +
  '"electricity distribution" OR "power distribution" OR "water network" OR "water distribution" OR ' +
  '"water supply" OR "sewer network" OR "sewerage network" OR "gas network" OR "gas distribution" OR ' +
  '"distribution network")';
const UTILITY_ACTIVITY_FT =
  '(GIS OR "geographic information" OR geospatial OR "asset mapping" OR "asset register" OR ' +
  '"asset inventory" OR "asset survey" OR "field survey" OR digitisation OR digitization OR topology OR ' +
  '"consumer indexing" OR "customer indexing" OR geodatabase OR "network model" OR "as-built" OR detection)';

// Search groups. GIS and telecom are queried SEPARATELY and each gets its own
// page budget. Previously a single combined query took one page of 120 sorted by
// publication date — and because the telecom families carry far more volume,
// they crowded GIS out almost entirely (17 GIS rows against 77 telecom). Giving
// each family its own budget is the single biggest lever on GIS coverage.
//
// `cpv` and `ft` are alternatives: a group supplies one or the other.
const GROUPS: { label: string; cpv?: string[]; ft?: string }[] = [
  { label: "geospatial", cpv: CPV_GEOSPATIAL },
  { label: "telecom", cpv: CPV_TELECOM },
  { label: "utility", ft: `${UTILITY_SECTOR_FT} AND ${UTILITY_ACTIVITY_FT}` },
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
      // TED returns ONLY the fields named here, so anything missing from this
      // list is absent from the response rather than merely unread. The value
      // fields were the reason the portal reported almost every EU tender as
      // "undisclosed": TED supplies the large majority of stored notices, and
      // with no value field requested, every one of them arrived without a
      // price — by construction, not because buyers withheld it. Measured after
      // adding them, 50% of open notices in these families publish a value.
      //
      // "notice-value" is rejected by the API with a 400; the four fields below
      // are the accepted spellings.
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "buyer-country",
        "publication-date",
        "deadline-receipt-tender-date-lot",
        "form-type",
        "winner-name",
        "total-value",
        "total-value-cur",
        "estimated-value-lot",
        "estimated-value-cur-lot",
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
    const selector = group.cpv
      ? `classification-cpv IN (${group.cpv.join(" ")})`
      : `FT=(${group.ft})`;
    const query =
      `${selector} ` +
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
    // Drop anything already bought — award notices, contract modifications and
    // direct-award intentions. See isStillOpenForBids().
    if (!isStillOpenForBids(n)) continue;
    const title = pickText(n["notice-title"]).replace(/\s+/g, " ").trim();
    const buyer = pickText(n["buyer-name"]).trim();
    const code = pickText(n["buyer-country"]).trim().toUpperCase();
    const country = COUNTRY[code] ?? (code || "European Union");
    const deadline = pickText(n["deadline-receipt-tender-date-lot"]).slice(0, 10) || null;
    const pubDate = (n["publication-date"] ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const value = noticeValue(n);

    out.push({
      sourceKey: SOURCE_KEY,
      source: SOURCE,
      sourceType: "Public Tender API",
      referenceNumber: pub,
      title: title || `EU tender notice ${pub}`,
      description: title, // TED search returns metadata, not the full body
      organization: buyer || "EU contracting authority",
      country,
      // Null amount means "the buyer published no value", which is half of all
      // open notices here. normalize.ts turns that into an undisclosed budget:
      // the row is kept and searchable but never reaches the board, because the
      // board shows a contract only when its value was actually published.
      amount: value?.amount ?? null,
      // The buyer's own currency, NOT a blanket "EUR". A third of the valued
      // notices in these families are priced in CZK, RON, PLN, SEK or NOK, and
      // labelling those euros overstated every one of them.
      currency: value?.currency ?? "EUR",
      deadline: deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      publicationDate: pubDate,
      officialLink: noticeLink(n),
      tags: ["EU", "TED"],
    });
  }
  return out;
}
