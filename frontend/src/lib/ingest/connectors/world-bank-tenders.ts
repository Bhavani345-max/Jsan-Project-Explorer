// World Bank procurement notices — the individual TENDERS issued under Bank-
// financed operations, as opposed to the operations themselves. Public API, no
// key required, same search service as the projects feed already connected.
//
// This is a different endpoint from world-bank.ts and answers a different
// question. The projects feed carries programme-level records ("Second Karachi
// Water and Sewerage Services Improvement Project") — a loan, not something to
// bid for. This feed carries the contracts the borrower then puts out under it
// ("Individual Consultant for the Assessment, Design and Roadmap Development of
// EDM's GIS Customer Mapping and Systems Integration Framework"), which is a
// biddable opportunity with a deadline and a named contact.
//
// WHY IT WAS ADDED — utility network intelligence barely exists in the other
// four sources. Measured when this connector was written: across the 763 stored
// notices from UK Contracts Finder, EU TED, the World Bank projects feed and
// SAM.gov, exactly ZERO were electrical/water/gas asset and consumer data work.
// TED's open notices under the utility CPV families are almost entirely
// commodity supply ("Supply of electricity 2027-2030") and civil works, and its
// text search returned nine open notices of which none was this work. The
// utilities that buy it are distribution companies in South Asia and Africa,
// and this is the public feed they publish through.
//
// Yield is honestly low — one qualifying open tender worldwide on the day this
// was written — because the work is intermittent and expression-of-interest
// windows are short, typically two weeks. The point of the connector is that
// the portal is looking when one appears.
import type { RawOpportunity } from "@/lib/ingest/normalize";

const BASE = "https://search.worldbank.org/api/v2/procnotices";
const SOURCE = "World Bank Tenders";
const SOURCE_KEY = "world-bank-tenders";

interface ProcNotice {
  id?: string;
  notice_type?: string;
  noticedate?: string; // "10-Aug-2026"
  notice_status?: string;
  submission_deadline_date?: string; // ISO with time
  project_ctry_name?: string;
  project_id?: string;
  project_name?: string;
  bid_reference_no?: string;
  bid_description?: string;
  contact_organization?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone_no?: string;
  contact_ctry_name?: string;
  notice_text?: string; // HTML body of the notice
}

/**
 * Search terms, chosen by measuring the live feed rather than by guessing.
 *
 * They are deliberately BROAD. `qterm` requires every word to match, so precise
 * phrasings collapse to nothing — "consumer indexing GIS distribution utility"
 * returns 3 notices in the entire 414,000-record archive and none of them open,
 * while a bare "electricity distribution" returns 26 open ones. Recall belongs
 * here and precision belongs in the classifier, which is the same division of
 * labour the TED connector uses with CPV codes: the query narrows the funnel,
 * the local domain gate decides what is carried.
 *
 * Measured open-notice yield per term on a representative run: GIS 16,
 * electricity distribution 26, distribution utility 12, water supply network 5,
 * geographic information system 5, gas distribution 3, asset management
 * utility 3. Roughly 70 open notices per run reach the classifier.
 */
const TERMS = [
  "GIS",
  "geographic information system",
  "electricity distribution",
  "water supply network",
  "gas distribution",
  "distribution utility",
  "asset management utility",
  "consumer indexing",
];

const PAGE_ROWS = 150; // the API's effective cap — larger values return 149-150
const THROTTLE_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "10-Aug-2026" → "2026-08-10". Returns today when unparseable. */
function parseNoticeDate(s: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!s) return today;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? today : d.toISOString().slice(0, 10);
}

/** The notice body is HTML; the pipeline wants readable text. */
function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The text the classifier reads, composed as TED's three-segment title:
 * "<country> – <buyer> – <assignment>".
 *
 * The buyer has to be in there. `bid_description` alone is often anonymous
 * about its own sector — the Mozambique notice above says only "EDM's GIS
 * Customer Mapping", and EDM means nothing to a keyword rule, while
 * "Electricity of Mozambique" is what makes it a utility notice. It also has to
 * survive into storage, because /api/cron/reclassify re-derives the focus area
 * from the stored title alone; drop the buyer and a later pass would refile
 * that notice as generic GIS.
 *
 * THREE segments, not two, and the difference is not cosmetic. lib/ingest/
 * goods.ts reads a title the way TED writes one: it strips the first two
 * segments and tests whether the remainder LEADS WITH a buy verb, anchored at
 * the start and unable to cross a dash. Composed as "<buyer> – <assignment>"
 * there is nothing to strip, so the anchored test only ever saw the buyer name
 * and every "Supply and Installation of …" sailed past it. Measured over 549
 * live notices, the two-segment shape caught 16 goods purchases and this one
 * catches 34 — the 18 it was missing include "Supply, Installation &
 * Commissioning of Smart Prepaid Gas Meters" and "Supply and Installation of
 * Smart Meters to Eleven Distribution Electricity Companies", which are exactly
 * the utility-flavoured product orders this portal exists to keep out.
 *
 * Classification is unaffected by the extra segment (0 service-line changes
 * across the same 549), and the buyer sitting where TED puts its CPV label
 * awards no spurious "capability service category" points (0 across the same
 * 549) — a buyer name has to read as a service category to score there, and
 * none does.
 */
function composeTitle(n: ProcNotice, country: string): string {
  const assignment = (n.bid_description ?? "").replace(/\s+/g, " ").trim();
  if (!assignment) return "";
  // The middle segment is the buyer; failing that the notice type, which is the
  // buyer's own procurement category and the nearest thing this feed has to a
  // CPV label. Something must hold the slot or the goods gate mis-reads the
  // title as a two-segment one.
  const middle =
    (n.contact_organization ?? "").replace(/\s+/g, " ").trim() ||
    (n.notice_type ?? "").trim() ||
    "Tender notice";
  return `${country} – ${middle} – ${assignment}`;
}

async function search(term: string): Promise<ProcNotice[]> {
  const url =
    `${BASE}?format=json&rows=${PAGE_ROWS}&srt=noticedate&order=desc` +
    `&qterm=${encodeURIComponent(term)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`World Bank tenders ${res.status}`);
  const body = (await res.json()) as { procnotices?: ProcNotice[] };
  return body.procnotices ?? [];
}

/**
 * Fetch current tender notices across every search term.
 *
 * One failing term does not lose the others: the first failure is reported only
 * if every term failed, which keeps a transient 5xx on one query from marking
 * the whole source unhealthy.
 */
export async function fetchWorldBankTenders(): Promise<RawOpportunity[]> {
  const seen = new Set<string>();
  const notices: ProcNotice[] = [];
  let firstError: Error | null = null;

  for (const [i, term] of TERMS.entries()) {
    if (i > 0) await sleep(THROTTLE_MS);
    try {
      for (const n of await search(term)) {
        const id = n.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        notices.push(n);
      }
    } catch (err) {
      firstError ??= err as Error;
    }
  }
  if (notices.length === 0 && firstError) throw firstError;

  const out: RawOpportunity[] = [];
  for (const n of notices) {
    // "Contract Award" records are history, not opportunities. The pipeline
    // would drop them anyway for having no deadline, but they are the single
    // largest notice type in this feed and skipping them here keeps the source
    // stats honest about what was actually considered.
    if (n.notice_type === "Contract Award") continue;
    if (n.notice_status && n.notice_status !== "Published") continue;

    const country =
      (n.project_ctry_name ?? "").trim() || (n.contact_ctry_name ?? "").trim() || "Unknown";
    const title = composeTitle(n, country);
    if (!n.id || !title) continue;

    const deadline = (n.submission_deadline_date ?? "").slice(0, 10);
    const body = stripHtml(n.notice_text);
    const project = (n.project_name ?? "").replace(/\s+/g, " ").trim();

    out.push({
      sourceKey: SOURCE_KEY,
      source: SOURCE,
      sourceType: "Public Tender API",
      referenceNumber: n.bid_reference_no?.trim() || n.id,
      title,
      // The programme the tender sits under is real context a bid team wants,
      // and it is the notice's own published field.
      description: [project && `Project: ${project}`, body].filter(Boolean).join(" — "),
      organization: (n.contact_organization ?? "").trim() || "World Bank borrower agency",
      country,
      // This feed publishes no contract value. Undisclosed budgets are kept by
      // the pipeline (see meetsMinBudget) exactly as TED's are.
      amount: null,
      currency: "USD",
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      publicationDate: parseNoticeDate(n.noticedate),
      officialLink: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${n.id}`,
      contact: {
        name: n.contact_name?.trim() || undefined,
        email: n.contact_email?.trim() || undefined,
        phone: n.contact_phone_no?.trim() || undefined,
      },
      tags: [n.notice_type, project ? "World Bank financed" : ""].filter(Boolean) as string[],
    });
  }
  return out;
}
