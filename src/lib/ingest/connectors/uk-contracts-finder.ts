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

export async function fetchUkContractsFinder(limit = 100): Promise<RawOpportunity[]> {
  // Only look at notices published in the last 90 days so we surface current,
  // still-open tenders rather than a backlog of expired ones.
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 19);
  const url = `${BASE}?stages=tender&limit=${limit}&publishedFrom=${from}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Contracts Finder ${res.status}`);
  const body = (await res.json()) as { releases?: OcdsRelease[] };
  const releases = body.releases ?? [];

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
