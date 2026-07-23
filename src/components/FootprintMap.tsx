"use client";

import Link from "next/link";
import { useState } from "react";
import type { FootprintPoint } from "@/lib/repository";

// Projection calibrated to public/world-map.png (Web-Mercator style world map).
// Longitude maps linearly to x; latitude via the Mercator y-transform.
const xFrac = (lon: number) => 0.00274 * lon + 0.473;
const mercY = (lat: number) => Math.log(Math.tan(((45 + lat / 2) * Math.PI) / 180));
const yFrac = (lat: number) => 0.695 - 0.2953 * mercY(lat);

const COLOR: Record<string, string> = {
  Headquarters: "var(--primary)",
  Office: "var(--accent)",
  Operating: "var(--success)",
};

export function FootprintMap({ points }: { points: FootprintPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div>
      <div
        className="relative w-full rounded-xl overflow-hidden border border-border"
        style={{ paddingBottom: "47.6%" }}
      >
        {/* real world-map base */}
        <img
          src="/world-map.png"
          alt="World map of JSAN's global footprint"
          className="absolute inset-0 w-full h-full object-cover dark:brightness-90 dark:contrast-95"
          draggable={false}
        />
        <div className="absolute inset-0 pointer-events-none dark:bg-[#0a121b]/25" />

        {/* markers */}
        {points.map((p, i) => {
          const isOffice = p.tier !== "Operating";
          const size = isOffice ? 13 + Math.min(p.count, 10) : 10 + Math.min(p.count, 8) * 0.8;
          const color = COLOR[p.tier] ?? "var(--success)";
          const left = xFrac(p.lon) * 100;
          const top = yFrac(p.lat) * 100;
          return (
            <Link
              key={p.country}
              href={`/explorer?country=${encodeURIComponent(p.country)}&sort=priority`}
              className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full transition-transform hover:scale-125 focus:outline-none focus:ring-2 focus:ring-primary z-[2]"
              style={{ left: `${left}%`, top: `${top}%` }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              aria-label={`${p.city}, ${p.country} — ${p.count} opportunities`}
            >
              <span
                className="rounded-full border-2 border-white"
                style={{ width: size, height: size, background: color, boxShadow: "0 1px 4px rgba(2,20,40,.45)" }}
              />
            </Link>
          );
        })}

        {/* hover tooltip */}
        {hover != null && (
          <div
            className="absolute z-[3] pointer-events-none card !rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg -translate-x-1/2"
            style={{ left: `${xFrac(points[hover].lon) * 100}%`, top: `calc(${yFrac(points[hover].lat) * 100}% + 14px)` }}
          >
            <div className="font-semibold">{points[hover].short}</div>
            <div className="text-text-muted">
              {points[hover].city} · {points[hover].count} open
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
