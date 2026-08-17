// US SAM.gov — federal contract opportunities. OPTIONAL: only runs when a
// free SAM_GOV_API_KEY is configured. Absent a key it yields nothing, so the
// pipeline stays fully keyless by default while remaining ready for US data.
import type { RawOpportunity } from "@/lib/ingest/normalize";

const BASE = "https://api.sam.gov/opportunities/v2/search";
const SOURCE = "US SAM.gov";
const SOURCE_KEY = "sam-gov";

interface SamOpp {
  noticeId?: string;
  title?: string;
  description?: string;
  fullParentPathName?: string;
  organizationType?: string;
  responseDeadLine?: string;
  postedDate?: string;
  uiLink?: string;
  award?: { amount?: string };
}

function mmddyyyy(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function fetchSamGov(limit = 100): Promise<RawOpportunity[]> {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) return []; // keyless by default — silently skipped

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const params = new URLSearchParams({
    api_key: key,
    limit: String(limit),
    postedFrom: mmddyyyy(from),
    postedTo: mmddyyyy(to),
    ptype: "o,p,k", // solicitations, presolicitations, combined synopsis
  });
  const res = await fetch(`${BASE}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SAM.gov ${res.status}`);
  const body = (await res.json()) as { opportunitiesData?: SamOpp[] };
  const items = body.opportunitiesData ?? [];

  const out: RawOpportunity[] = [];
  for (const o of items) {
    const title = (o.title ?? "").replace(/\s+/g, " ").trim();
    if (!o.noticeId || !title) continue;
    const amount = o.award?.amount ? Number(o.award.amount.replace(/[^0-9.]/g, "")) : null;
    out.push({
      sourceKey: SOURCE_KEY,
      source: SOURCE,
      sourceType: "Government Procurement API",
      referenceNumber: o.noticeId,
      title,
      description: (o.description ?? "").trim() || title,
      organization: (o.fullParentPathName ?? "").split(".")[0]?.trim() || "US federal agency",
      country: "United States",
      amount: amount && Number.isFinite(amount) ? amount : null,
      currency: "USD",
      deadline: o.responseDeadLine ? o.responseDeadLine.slice(0, 10) : null,
      publicationDate: (o.postedDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      officialLink: o.uiLink ?? "https://sam.gov",
      tags: ["US", "Federal"],
    });
  }
  return out;
}
