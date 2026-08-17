// UK Contracts Finder — official Cabinet Office OCDS release feed.
// Public API, no key, Open Government Licence v3. Every record is traceable
// back to the government notice via its ocid + notice URL.
import type { RawOpportunity } from "@/lib/ingest/normalize";

const BASE = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search";
const SOURCE = "UK Contracts Finder";
const SOURCE_KEY = "uk-contracts-finder";

interface OcdsRelease {
  ocid?: string;
  date?: string;
  tender?: {
    title?: string;
    description?: string;
    value?: { amount?: number; currency?: string };
    tenderPeriod?: { endDate?: string };
    status?: string;
    classification?: { description?: string };
    documents?: { documentType?: string; url?: string }[];
  };
  buyer?: { name?: string };
}

function noticeUrl(r: OcdsRelease): string {
  const doc = (r.tender?.documents ?? []).find((d) => d.url);
  if (doc?.url) return doc.url;
  return `https://www.contractsfinder.service.gov.uk/notice/${r.ocid ?? ""}`;
}

const PAGE_SIZE = 100; // API maximum; limit=500 is rejected outright.
const THROTTLE_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch UK tender notices, following the OCDS cursor across pages.
 *
 * This feed is a bulk release stream, NOT a search: `keyword`, `searchTerm` and
 * `cpvCodes` are all silently ignored (verified against the live API — they
 * return the same unfiltered page), so there is no way to ask it for geospatial
 * work. The only way to find UK GIS and telecom notices is to page through the
 * stream and let the local domain gate do the filtering.
 *
 * MEASURED YIELD — do not raise maxPages expecting more GIS work. Paging 979
 * notices (roughly ten pages) returned exactly ONE in-domain record: the UK feed
 * is overwhelmingly schools, care, highways and facilities contracts, so the base
 * rate is about 0.1%. Ten pages cost ~70s of the cron budget for no extra
 * records, so this is deliberately kept small — enough to catch a UK geospatial
 * or telecom tender when one is published, without spending the run on a feed
 * that cannot be filtered. Real UK volume needs a different source, not more
 * pages of this one.
 *
 * @param maxPages Bounded so the cron's 300s budget is never at risk.
 */
export async function fetchUkContractsFinder(maxPages = 5): Promise<RawOpportunity[]> {
  // Only look at notices published in the last 90 days so we surface current,
  // still-open tenders rather than a backlog of expired ones.
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 19);
  let url: string | null = `${BASE}?stages=tender&limit=${PAGE_SIZE}&publishedFrom=${from}`;

  const releases: OcdsRelease[] = [];
  for (let page = 0; page < maxPages && url; page++) {
    if (page > 0) await sleep(THROTTLE_MS);
    const res: Response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    // The first page failing is a real error; a later page failing just ends
    // pagination and keeps what we already have.
    if (!res.ok) {
      if (page === 0) throw new Error(`Contracts Finder ${res.status}`);
      break;
    }
    const body = (await res.json()) as { releases?: OcdsRelease[]; links?: { next?: string } };
    const batch = body.releases ?? [];
    if (batch.length === 0) break;
    releases.push(...batch);
    url = body.links?.next ?? null;
  }

  const out: RawOpportunity[] = [];
  for (const r of releases) {
    const t = r.tender;
    const title = (t?.title ?? "").replace(/\s+/g, " ").trim();
    if (!r.ocid || !title || !r.date) continue;
    out.push({
      sourceKey: SOURCE_KEY,
      source: SOURCE,
      sourceType: "Government Procurement API",
      referenceNumber: r.ocid,
      title,
      description: (t?.description ?? "").trim(),
      organization: (r.buyer?.name ?? "").trim() || "UK public sector buyer",
      country: "United Kingdom",
      amount: typeof t?.value?.amount === "number" ? t.value.amount : null,
      currency: t?.value?.currency ?? "GBP",
      deadline: t?.tenderPeriod?.endDate ? t.tenderPeriod.endDate.slice(0, 10) : null,
      publicationDate: r.date.slice(0, 10),
      officialLink: noticeUrl(r),
      tags: t?.classification?.description ? [t.classification.description] : [],
    });
  }
  return out;
}
