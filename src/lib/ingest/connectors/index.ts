// Connector registry + runner. Fetches every source concurrently, normalizes
// and de-duplicates the results, and reports per-source stats. One failing
// source never blocks the others.
import {
  normalize,
  isOpenOpportunity,
  meetsMinBudget,
  isGoodsProcurement,
  type NormalizedOpportunity,
  type RawOpportunity,
} from "@/lib/ingest/normalize";
import { isTargetServiceLine } from "@/lib/domain";
import { fetchUkContractsFinder } from "./uk-contracts-finder";
import { fetchEuTed } from "./eu-ted";
import { fetchWorldBank } from "./world-bank";
import { fetchSamGov } from "./sam-gov";

export interface SourceStat {
  source: string;
  fetched: number; // raw records returned by the source
  kept: number; // in-domain, open, above the budget floor
  offDomain: number; // dropped as neither geospatial nor telecom
  goods: number; // dropped as a purchase of product rather than services
  ok: boolean;
  error?: string;
}

export interface IngestResult {
  rows: NormalizedOpportunity[];
  stats: SourceStat[];
}

interface Connector {
  source: string;
  run: () => Promise<RawOpportunity[]>;
}

const CONNECTORS: Connector[] = [
  { source: "UK Contracts Finder", run: () => fetchUkContractsFinder() },
  { source: "EU TED", run: () => fetchEuTed() },
  { source: "World Bank", run: () => fetchWorldBank() },
  { source: "US SAM.gov", run: () => fetchSamGov() }, // no-op without a key
];

export async function runConnectors(): Promise<IngestResult> {
  const settled = await Promise.allSettled(CONNECTORS.map((c) => c.run()));

  const stats: SourceStat[] = [];
  const seen = new Set<string>();
  const rows: NormalizedOpportunity[] = [];

  settled.forEach((result, i) => {
    const { source } = CONNECTORS[i];
    if (result.status === "fulfilled") {
      const raws = result.value;
      let kept = 0;
      let offDomain = 0;
      let goods = 0;
      for (const raw of raws) {
        const row = normalize(raw);
        // Domain gate: the portal only carries geospatial and telecom work.
        // Applied here so out-of-scope notices are never persisted.
        if (!isTargetServiceLine(row.serviceLine)) {
          offDomain++;
          continue;
        }
        // Scope gate: JSAN delivers services, it does not trade goods. A
        // notice that is a purchase of product is dropped even when its
        // subject matter is telecom or geospatial — "Supply of network
        // switches" is a hardware order, not network engineering.
        if (isGoodsProcurement(row.title)) {
          goods++;
          continue;
        }
        if (!isOpenOpportunity(row)) continue; // drop closed / stale
        if (!meetsMinBudget(row)) continue; // drop disclosed budgets under MIN_BUDGET_USD ($1M)
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
        kept++;
      }
      stats.push({ source, fetched: raws.length, kept, offDomain, goods, ok: true });
    } else {
      stats.push({
        source,
        fetched: 0,
        kept: 0,
        offDomain: 0,
        goods: 0,
        ok: false,
        error: String(result.reason?.message ?? result.reason).slice(0, 200),
      });
    }
  });

  return { rows, stats };
}
