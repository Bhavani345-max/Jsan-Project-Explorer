"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Page sizes offered in the "per page" control. */
export const PAGE_SIZE_OPTIONS = [9, 18, 36, 60];
export const DEFAULT_PAGE_SIZE = 9;

/** Above this many pages, stepping with Prev/Next stops being practical and a
 *  "go to page" box is offered instead. The live store runs to ~130 pages. */
const JUMP_THRESHOLD = 10;

type Slot = number | "gap";

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** Insert a "…" only where it actually saves space: a gap standing in for a
 *  single page is replaced by that page, since "…" is no shorter than "7". */
function collapse(pages: number[]): Slot[] {
  const out: Slot[] = [];
  let prev = 0;
  for (const p of pages) {
    if (prev && p - prev === 2) out.push(prev + 1);
    else if (prev && p - prev > 2) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * The compact page list: first page, last page, a window around the current
 * one, and "…" for the runs between.
 *
 * This replaced a control that rendered one button per page. With ~1,150
 * opportunities at 9 per page that was ~128 buttons wrapping over several
 * rows. The slot count here is constant (`2 * siblings + 5`) once there are
 * more pages than fit, so the control keeps its width as you page through and
 * Next stays under the cursor instead of sliding away.
 *
 * Exported for the sanity check in `pageWindow` usage — it is pure and has no
 * React dependency.
 */
export function pageWindow(page: number, totalPages: number, siblings = 1): Slot[] {
  const slots = siblings * 2 + 5; // first + last + current + siblings + 2 gaps
  if (totalPages <= slots) return range(1, totalPages);

  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, totalPages);

  // Near an end there is no gap on that side, so the window widens to keep the
  // total number of slots the same.
  if (left <= 2) return collapse([...range(1, slots - 2), totalPages]);
  if (right >= totalPages - 1) return collapse([1, ...range(totalPages - slots + 3, totalPages)]);
  return collapse([1, ...range(left, right), totalPages]);
}

interface Props {
  page: number;
  pageSize: number;
  /** Total matching records across all pages, not the length of this page. */
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the per-page control. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun for the range summary, e.g. "opportunities". */
  itemLabel?: string;
  /** Dim the control while the next page is in flight. */
  busy?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  itemLabel = "results",
  busy = false,
}: Props) {
  const [jump, setJump] = useState(String(page));

  // The page can move without the box being touched — Prev/Next, a filter
  // reset, or the server clamping a too-high ?page= from a stale bookmark.
  useEffect(() => setJump(String(page)), [page]);

  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const go = (n: number) => {
    const target = Math.min(Math.max(Math.trunc(n), 1), totalPages);
    if (target !== page) onPageChange(target);
  };

  const submitJump = () => {
    const n = Number(jump);
    if (Number.isFinite(n) && n >= 1) go(n);
    else setJump(String(page)); // reject junk, restore what is actually shown
  };

  return (
    <nav
      aria-label="Pagination"
      className={`mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 ${
        busy ? "opacity-60" : ""
      }`}
    >
      <p className="text-[13px] text-text-faint" aria-live="polite">
        Showing{" "}
        <span className="font-semibold text-text-muted tabular-nums">
          {first.toLocaleString()}–{last.toLocaleString()}
        </span>{" "}
        of <span className="font-semibold text-text-muted tabular-nums">{total.toLocaleString()}</span>{" "}
        {itemLabel}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-text-faint">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="input !w-auto !py-1.5 cursor-pointer"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => go(page - 1)}
              className="btn btn-ghost !px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Previous</span>
            </button>

            {/* Numbers on a roomy viewport; a plain counter on a phone, where
                nine tap targets would not fit beside Previous/Next. */}
            <ol className="hidden sm:flex items-center gap-1">
              {pageWindow(page, totalPages).map((slot, i) =>
                slot === "gap" ? (
                  <li
                    key={`gap-${i}`}
                    aria-hidden="true"
                    className="w-6 text-center text-text-faint select-none"
                  >
                    …
                  </li>
                ) : (
                  <li key={slot}>
                    <button
                      type="button"
                      onClick={() => go(slot)}
                      aria-label={`Page ${slot}`}
                      aria-current={slot === page ? "page" : undefined}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                        slot === page
                          ? "bg-primary text-white"
                          : "text-text-muted hover:bg-bg-subtle"
                      }`}
                    >
                      {slot}
                    </button>
                  </li>
                ),
              )}
            </ol>
            <span className="sm:hidden text-[13px] text-text-muted tabular-nums px-1">
              {page} / {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => go(page + 1)}
              className="btn btn-ghost !px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {totalPages > JUMP_THRESHOLD && (
          <div className="flex items-center gap-1.5 text-[13px]">
            <label htmlFor="page-jump" className="text-text-faint">
              Go to
            </label>
            <input
              id="page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onBlur={submitJump}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitJump();
                }
              }}
              aria-label={`Go to page, 1 to ${totalPages}`}
              className="input !w-16 !py-1.5 text-center tabular-nums"
            />
            <span className="text-text-faint tabular-nums">of {totalPages}</span>
          </div>
        )}
      </div>
    </nav>
  );
}
