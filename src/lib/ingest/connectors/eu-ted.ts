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

export async function fetchEuTed(limit = 60): Promise<RawOpportunity[]> {
  // JSAN-relevant CPV families: IT services, telecom equipment/networks,
  // mapping/GIS services, and software packages.
  const query =
    "classification-cpv IN (72000000 32000000 32400000 71354000 48000000) SORT BY publication-date DESC";
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
      page: 1,
      limit,
      scope: "ALL",
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TED ${res.status}`);
  const body = (await res.json()) as { notices?: TedNotice[] };
  const notices = body.notices ?? [];

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
