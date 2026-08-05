import { Check, Minus } from "lucide-react";
import type { FitBreakdown as Breakdown } from "@/lib/scoring";

/**
 * The fit score, shown as the arithmetic that produced it.
 *
 * Every row is one rule from lib/scoring.ts: what it looks for, whether it
 * fired on this notice, what in the notice fired it, and what it contributed.
 * The point is that the total is auditable — someone challenged on a score can
 * read this panel top to bottom and defend it.
 */
export function FitBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const { score, awarded, rules, capped, disqualified } = breakdown;
  const matched = rules.filter((r) => r.matched);

  if (disqualified) {
    return (
      <div>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-3xl font-bold tabular-nums text-text-faint">0</span>
          <span className="text-text-faint text-sm">/ 100 · out of scope</span>
        </div>
        <p className="text-[13px] text-text-muted">
          {rules[0]?.evidence ??
            "This notice is a purchase of product rather than a contract for services."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-3xl font-bold tabular-nums">{score}</span>
        <span className="text-text-faint text-sm">
          / 100 · {matched.length} of {rules.length} rules scored
        </span>
      </div>

      <div className="space-y-1.5">
        {rules.map((r) => (
          <div
            key={r.id}
            className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${
              r.matched ? "bg-bg-subtle" : ""
            }`}
          >
            <span
              className="grid place-items-center w-5 h-5 rounded-md shrink-0 mt-px"
              style={
                r.matched
                  ? { background: "var(--success-soft)", color: "var(--success)" }
                  : { background: "var(--bg-subtle)", color: "var(--text-faint)" }
              }
            >
              {r.matched ? <Check size={13} /> : <Minus size={13} />}
            </span>

            <div className="min-w-0 flex-1">
              <div className={`text-[13px] ${r.matched ? "font-medium" : "text-text-muted"}`}>
                {r.label}
              </div>
              {r.evidence && (
                <div className="text-[11px] text-text-faint mt-0.5 break-words">
                  {r.matched ? "matched: " : ""}
                  {r.evidence}
                </div>
              )}
            </div>

            {/* Rules award a range, not a flat weight — show what this notice
                earned against what was on offer, so a partial score reads as
                partial rather than as a miss. */}
            <span
              className={`text-[13px] font-semibold tabular-nums shrink-0 ${
                r.matched ? "text-success" : "text-text-faint"
              }`}
            >
              {r.matched ? `+${r.points}` : "0"}
              {r.max > 0 && r.points < r.max && (
                <span className="font-medium text-text-faint"> / {r.max}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border mt-3 pt-3 text-[13px]">
        <span className="font-semibold">Total</span>
        <span className="font-bold tabular-nums">
          {capped ? (
            <>
              <span className="text-text-faint font-medium">{awarded} → </span>
              {score}
            </>
          ) : (
            score
          )}
        </span>
      </div>
      {capped && (
        <p className="text-[11px] text-text-faint mt-1.5">
          Rules awarded {awarded} points; the score is capped at 100.
        </p>
      )}
    </div>
  );
}
