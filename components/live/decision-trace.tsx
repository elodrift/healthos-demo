/**
 * Shows how WHOOP readings became decisions in today's plan.
 *
 * The design point: a reading and its consequence sit on the same row, so the
 * causal claim is visible rather than implied. "Recovery 28%" alone invites the
 * user to guess what it did; "Recovery 28% -> bedtime 45 minutes earlier" states
 * it, and can be argued with.
 *
 * The second section is the one that matters most. WHOOP supplies strain, HRV,
 * resting HR and calories, and none of them shape this plan. A panel that
 * displayed them next to the schedule would imply otherwise, so they are listed
 * apart, under a heading that says plainly that they changed nothing.
 */

import type { DecisionTraceEntry } from "@/lib/planner/propose-day";
import { UNUSED_WEARABLE_SIGNALS } from "@/lib/planner/propose-day";

export function DecisionTrace({ trace }: { trace: DecisionTraceEntry[] }) {
  if (trace.length === 0) return null;

  const measured = trace.filter((t) => t.basis === "MEASURED").length;

  return (
    <section
      aria-labelledby="trace-heading"
      className="flex flex-col gap-4 rounded-lg border border-base-800 bg-base-900 p-4"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="trace-heading"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Why today looks like this
        </h2>
        <p className="text-[13px] leading-relaxed text-ink-lo">
          {measured === trace.length
            ? "Every decision below came from a reading."
            : `${measured} of ${trace.length} decisions came from a reading. The rest fell back to your profile or a default.`}
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {trace.map((entry, i) => (
          <li
            key={`${entry.input}-${i}`}
            /*
             * Assumed rows are deliberately quieter: an inferred decision should
             * not carry the same visual authority as a measured one.
             *
             * Set with Tailwind classes rather than an inline `var(--color-*)`,
             * because this project is Tailwind v3 — the palette lives in
             * `tailwind.config.ts` and no such CSS variables exist, so the inline
             * version silently produced no border at all.
             */
            className={`flex flex-col gap-1.5 border-l-2 pl-3 ${
              entry.basis === "MEASURED" ? "border-accent-green" : "border-base-700"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
                {entry.label}
              </span>
              {entry.reading !== null ? (
                <span className="font-mono text-[13px] text-ink-hi">{entry.reading}</span>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-lo">
                  No reading
                </span>
              )}
              <span
                className={`ml-auto font-mono text-[9px] uppercase tracking-[0.14em] ${
                  entry.basis === "MEASURED" ? "text-accent-green" : "text-ink-lo"
                }`}
              >
                {entry.basis === "MEASURED" ? "Measured" : "Assumed"}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-hi">{entry.effect}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 border-t border-base-800 pt-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          Collected, but changed nothing here
        </h3>
        <ul className="flex flex-col gap-1.5">
          {UNUSED_WEARABLE_SIGNALS.map((s) => (
            <li key={s.field} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[11px] text-ink-lo">{s.label}</span>
              <span className="text-[12px] leading-relaxed text-ink-lo">{s.why}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
