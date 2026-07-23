import type { PresenceTier } from "./types";

// ------------------------------------------------------------------
// JSAN Consulting's operating footprint. Opportunities located where JSAN
// has an office or an operating presence are prioritized over new markets.
// This is a read-time signal — it never mutates the opportunity records.
// ------------------------------------------------------------------

export interface OfficeDef {
  country: string;
  city: string;
  region?: string;
  /** badge label shown on a card / details page */
  label: string;
  /** short label for the dashboard panel */
  short: string;
  tier: PresenceTier;
  rank: number; // higher = higher priority
  boost: number;
  lat: number;
  lon: number;
}

// Offices — highest priority.
export const JSAN_OFFICES: OfficeDef[] = [
  { country: "United Kingdom", city: "Brentford", region: "Middlesex", label: "UK HQ · Brentford", short: "UK Headquarters", tier: "Headquarters", rank: 4, boost: 10, lat: 51.49, lon: -0.31 },
  { country: "Germany", city: "Berlin", region: "Südwestkorso", label: "European HQ · Berlin", short: "European HQ", tier: "Headquarters", rank: 4, boost: 10, lat: 52.52, lon: 13.40 },
  { country: "India", city: "Hyderabad", region: "Gachibowli", label: "India Office · Hyderabad", short: "India Regional Office", tier: "Office", rank: 3, boost: 8, lat: 17.39, lon: 78.49 },
  { country: "United States", city: "New Jersey", label: "US Office · New Jersey", short: "US Office", tier: "Office", rank: 3, boost: 8, lat: 40.35, lon: -74.55 },
  { country: "Malaysia", city: "Kuala Lumpur", label: "APAC Office · Kuala Lumpur", short: "APAC Office", tier: "Office", rank: 3, boost: 8, lat: 3.14, lon: 101.69 },
];

// Operating markets — second priority.
export const JSAN_OPERATING: Record<string, { city: string; lat: number; lon: number }> = {
  France: { city: "Paris", lat: 48.85, lon: 2.35 },
  Poland: { city: "Warsaw", lat: 52.23, lon: 21.01 },
  Sweden: { city: "Stockholm", lat: 59.33, lon: 18.06 },
  Norway: { city: "Oslo", lat: 59.91, lon: 10.75 },
  Brazil: { city: "São Paulo", lat: -23.55, lon: -46.63 },
  Canada: { city: "Toronto", lat: 43.65, lon: -79.38 },
  Estonia: { city: "Tallinn", lat: 59.44, lon: 24.75 },
};

export interface PresenceInfo {
  tier: PresenceTier;
  label: string;
  rank: number;
  boost: number;
}

export function presenceFor(country: string): PresenceInfo {
  const office = JSAN_OFFICES.find((o) => o.country === country);
  if (office) return { tier: office.tier, label: office.label, rank: office.rank, boost: office.boost };
  const op = JSAN_OPERATING[country];
  if (op) return { tier: "Operating", label: `Operating · ${op.city}`, rank: 2, boost: 4 };
  return { tier: "New Market", label: "New market", rank: 1, boost: 0 };
}
