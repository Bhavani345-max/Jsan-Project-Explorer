// US SAM.gov — federal contract opportunities. OPTIONAL: only runs when a
// free SAM_GOV_API_KEY is configured. Absent a key it yields nothing, so the
// pipeline stays fully keyless by default while remaining ready for US data.
//
// TARGETING — why this queries per NAICS code instead of once.
//
// SAM.gov publishes on the order of a thousand notices a day across every kind
// of federal buying there is. An untargeted call therefore spent its whole
// record budget on office furniture and base catering, and the domain gate
// dropped essentially all of it: the same 0.1% problem measured on the UK feed,
// but against a much larger haystack. Unlike the UK feed, SAM.gov CAN be asked
// a narrow question — `ncode` filters by NAICS — so each request is aimed at one
// industry code we actually serve, and every record returned is already in the
// right neighbourhood before the local gates see it.
//
// `ncode` takes a single value, hence one request per code rather than one
// request with a list.
//
// UNVERIFIED AGAINST THE LIVE API. api.sam.gov's gateway answers 404 to every
// path from outside the US — including unrelated APIs on the same host — so
// this could not be exercised from the development machine. Vercel runs these
// functions in iad1 (US East), where it is expected to work. The first run
// after a key is configured will record its outcome, error text included, in
// `ingest_runs`; read it with /api/cron/runs.
import type { RawOpportunity } from "@/lib/ingest/normalize";

const BASE = "https://api.sam.gov/opportunities/v2/search";
const SOURCE = "US SAM.gov";
const SOURCE_KEY = "sam-gov";

/**
 * NAICS codes worth a request, chosen for precision over reach.
 *
 * Broad engineering codes (541330 Engineering Services above all) are
 * deliberately absent: they are enormous, overwhelmingly civil and structural,
 * and would spend a request's whole record budget on work outside the domain —
 * exactly the failure this targeting exists to fix.
 */
const NAICS: { code: string; note: string }[] = [
  { code: "541370", note: "Surveying and mapping (except geophysical) — the canonical geospatial code" },
  { code: "541360", note: "Geophysical surveying and mapping" },
  { code: "541519", note: "Other computer related services — where GIS and network integration land" },
  { code: "517111", note: "Wired telecommunications carriers (NAICS 2022)" },
  // Retired in the 2022 revision but still attached to notices written against
  // the older schedule, and dropping it would silently lose them.
  { code: "517311", note: "Wired telecommunications carriers (pre-2022 code, still in use)" },
  { code: "517810", note: "All other telecommunications" },
  { code: "237130", note: "Power and communication line construction — carries the line-engineering work" },
];

const PER_CODE = 100;
const THROTTLE_MS = 400;
const LOOKBACK_DAYS = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * One NAICS code's worth of notices.
 *
 * Errors carry the status AND a slice of the body. SAM.gov answers an expired
 * key, an over-quota key and an unroutable request with three different bodies
 * and occasionally the same status, so the status alone does not say what to
 * fix — and this string is what lands in the run log.
 */
async function fetchCode(key: string, code: string, from: string, to: string): Promise<SamOpp[]> {
  const params = new URLSearchParams({
    api_key: key,
    limit: String(PER_CODE),
    postedFrom: from,
    postedTo: to,
    ptype: "o,p,k", // solicitations, presolicitations, combined synopsis
    ncode: code,
  });
  const res = await fetch(`${BASE}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SAM.gov ${res.status} for NAICS ${code}: ${body.slice(0, 160) || "(empty body)"}`);
  }
  const parsed = (await res.json()) as { opportunitiesData?: SamOpp[] };
  return parsed.opportunitiesData ?? [];
}

export async function fetchSamGov(): Promise<RawOpportunity[]> {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) return []; // keyless by default — silently skipped

  const now = new Date();
  const to = mmddyyyy(now);
  const from = mmddyyyy(new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000));

  // A notice can be filed under more than one of these codes.
  const seen = new Set<string>();
  const items: SamOpp[] = [];
  let firstError: Error | null = null;

  for (const [i, { code }] of NAICS.entries()) {
    if (i > 0) await sleep(THROTTLE_MS);
    try {
      for (const o of await fetchCode(key, code, from, to)) {
        const id = o.noticeId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push(o);
      }
    } catch (err) {
      // One bad code must not cost the other six. Remembered, not swallowed:
      // if nothing at all came back it is rethrown below, so a wholly broken
      // key or an unroutable host still reports as a failed source rather than
      // as a source that quietly found nothing.
      firstError ??= err as Error;
    }
  }

  if (items.length === 0 && firstError) throw firstError;

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
