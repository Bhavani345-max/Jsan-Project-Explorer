// Connector registry + runner. Fetches every source concurrently, normalizes
// and de-duplicates the results, and reports per-source stats. One failing
// source never blocks the others.
import {
  normalize,
  isOpenOpportunity,
  meetsMinBudget,
  type NormalizedOpportunity,
  type RawOpportunity,
} from "@/lib/ingest/normalize";
import { fetchUkContractsFinder } from "./uk-contracts-finder";
import { fetchEuTed } from "./eu-ted";
import { fetchWorldBank } from "./world-bank";
import { fetchSamGov } from "./sam-gov";

export interface SourceStat {
  source: string;
  fetched: number; // raw records returned by the source
  kept: number; // records that are currently open/pursuable
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
      for (const raw of raws) {
        const row = normalize(raw);
        if (!isOpenOpportunity(row)) continue; // drop closed / stale
        if (!meetsMinBudget(row)) continue; // drop disclosed budgets under MIN_BUDGET_USD ($1M)
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
        kept++;
      }
      stats.push({ source, fetched: raws.length, kept, ok: true });
    } else {
      stats.push({
        source,
        fetched: 0,
        kept: 0,
        ok: false,
        error: String(result.reason?.message ?? result.reason).slice(0, 200),
      });
    }
  });

  return { rows, stats };
}
