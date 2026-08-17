"use client";

// ------------------------------------------------------------------
// Topbar notifications — the newest opportunities to reach the portal.
//
// The feed itself is derived server-side from ingested_at (see
// lib/notifications.ts). What lives here is the only piece of state a
// notification system actually needs when everyone sees the same feed: a
// "last seen" watermark. It is kept in localStorage per signed-in email, so
// unread means "arrived since you last opened this", with no table, no writes
// and nothing to migrate.
//
// The trade-off is that the watermark is per browser rather than per account —
// signing in on a second machine shows the feed as unread again. For a daily-
// ingest internal portal that is a fair price for not putting a write on a read
// path.
// ------------------------------------------------------------------

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Building2, MapPin, Wallet, Inbox } from "lucide-react";
import { FitBadge } from "./ui";
import { relTime, deadlineLabel, daysLeft } from "@/lib/format";

interface Item {
  id: string;
  title: string;
  organization: string;
  country: string;
  budgetLabel: string;
  fitScore: number;
  highFit: boolean;
  status: string;
  deadline: string;
  at: string;
}

// The portal ingests once a day, so this is about catching a run that finished
// while a tab was left open — not about being realtime. Cheap either way: the
// route returns 20 rows.
const POLL_MS = 5 * 60_000;

function storageKey(userKey: string | null): string {
  return `jsan:notifications:seen:${userKey ?? "anon"}`;
}

/** ms since epoch, or null for anything unparseable. */
function instant(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function Notifications({ userKey }: { userKey: string | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // null while the watermark is still being read, so the badge does not flash a
  // full unread count for a moment on every page load.
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  // Frozen at the moment the panel opens: opening marks everything read, but
  // the items that *were* unread stay flagged for as long as you are looking.
  const [highlightFrom, setHighlightFrom] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Watermark, per signed-in user. Re-read when the identity resolves.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(userKey));
      setLastSeen(raw ? Number(raw) || 0 : 0);
    } catch {
      // Private mode / storage disabled — treat everything as already seen
      // rather than showing a permanent unread badge nothing can clear.
      setLastSeen(Date.now());
    }
  }, [userKey]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: Item[]; live: boolean };
      setItems(Array.isArray(data.items) ? data.items : []);
      setLive(Boolean(data.live));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    // A tab left open overnight would otherwise show yesterday's feed until the
    // next interval fires.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread =
    lastSeen === null ? 0 : items.filter((i) => (instant(i.at) ?? 0) > lastSeen).length;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Opening is what marks the feed read. Watermark to the newest item rather
    // than to now(), so anything that lands while the panel is open still
    // counts as unread next time.
    setHighlightFrom(lastSeen);
    const newest = items.reduce((max, i) => Math.max(max, instant(i.at) ?? 0), 0);
    if (newest > 0 && newest !== lastSeen) {
      setLastSeen(newest);
      try {
        window.localStorage.setItem(storageKey(userKey), String(newest));
      } catch {
        // Nothing to do — the badge simply comes back on the next load.
      }
    }
    setOpen(true);
    // Opening is also the one moment the freshness of this feed is visible, so
    // it is worth a round trip.
    load();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        title={unread > 0 ? `${unread} new ${unread === 1 ? "opportunity" : "opportunities"}` : "New opportunities"}
        className="btn btn-on-brand !px-2.5 relative"
      >
        <Bell size={18} />
        {/* No ring on the badge: the topbar is a gradient (.brand-band), so any
            single flat ring colour reads as a halo at one end of it. Red on
            blue carries it on contrast alone. */}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full bg-danger text-white text-[10px] font-bold leading-none shadow-sm">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[92vw] max-w-[400px] card p-0 z-40 animate-in overflow-hidden">
          <div className="flex items-baseline justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold">New opportunities</h3>
              <p className="text-[11px] text-text-faint truncate">
                {live ? "Latest to reach the portal" : "Sample dataset — not live tenders"}
              </p>
            </div>
            {highlightFrom !== null && unreadAgainst(items, highlightFrom) > 0 && (
              <span className="chip !bg-primary-soft !text-primary !border-transparent shrink-0">
                {unreadAgainst(items, highlightFrom)} new
              </span>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">Loading…</p>
            ) : failed && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-text-faint">
                Could not load new opportunities.
              </p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox size={22} className="mx-auto mb-2 text-text-faint" />
                <p className="text-[13px] font-medium">Nothing new yet</p>
                <p className="text-[11px] text-text-faint mt-0.5">
                  The next ingest run will fill this in.
                </p>
              </div>
            ) : (
              items.map((i) => {
                const isNew = highlightFrom !== null && (instant(i.at) ?? 0) > highlightFrom;
                const dl = daysLeft(i.deadline);
                return (
                  <Link
                    key={i.id}
                    href={`/projects/${i.id}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 border-b border-border last:border-0 hover:bg-bg-subtle transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          isNew ? "bg-primary" : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-[13px] leading-snug line-clamp-2 ${
                              isNew ? "font-semibold" : "font-medium text-text-muted"
                            }`}
                          >
                            {i.title}
                          </p>
                          <FitBadge score={i.fitScore} />
                        </div>

                        <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-text-faint">
                          <span className="flex items-center gap-1 min-w-0">
                            <Building2 size={11} className="shrink-0" />
                            <span className="truncate">{i.organization}</span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <MapPin size={11} />
                            {i.country}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-2.5 text-[11px]">
                          <span className="flex items-center gap-1 font-semibold text-text">
                            <Wallet size={11} className="text-text-faint" />
                            {i.budgetLabel}
                          </span>
                          <span className={dl >= 0 && dl <= 7 ? "text-warning font-semibold" : "text-text-faint"}>
                            {deadlineLabel(i.deadline)}
                          </span>
                          <span className="ml-auto text-text-faint shrink-0">{relTime(i.at)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <Link
            href="/explorer?sort=publicationDate"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-[12px] font-semibold text-primary border-t border-border hover:bg-bg-subtle transition-colors"
          >
            View all in Project Explorer
          </Link>
        </div>
      )}
    </div>
  );
}

/** How many items postdate a given watermark. */
function unreadAgainst(items: Item[], since: number): number {
  return items.filter((i) => (instant(i.at) ?? 0) > since).length;
}
