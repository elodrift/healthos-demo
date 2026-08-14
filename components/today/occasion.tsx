"use client";

/**
 * One eating occasion: exactly three options, one decision.
 *
 * Three is a product rule rather than a layout accident — the decision is "pick
 * one", asked once — so the group is labelled as a radio group. That is also the
 * honest accessibility mapping: a single choice among alternatives, not three
 * independent buttons.
 *
 * The whole card is the tap target and the "I'll have this" pill inside it is a
 * visual affordance only, not a nested button. The first pass styled that pill as
 * quiet mono text, where it sat indistinguishable from the metadata above it and
 * read as a caption rather than an action — the one clear affordance the screen
 * is required to have was invisible. It now carries a border and reacts on hover.
 *
 * Option rows are separated by fill rather than by strong borders. Three bordered
 * boxes inside a bordered card produced four competing frames per occasion, which
 * is what made the first pass look busy at full height.
 *
 * Selection says "Chosen", never "Saved". There is no backend on this screen and
 * a word implying a round-trip would be the same class of lie as a fake-precise
 * estimate.
 */

import { useState } from "react";
import { AmountValue } from "@/components/today/amount";
import { CHANNEL_LABEL, type Occasion } from "@/lib/today/fixture";

export function OccasionCard({ occasion }: { occasion: Occasion }) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const isNow = occasion.kind === "now";

  return (
    <section
      aria-labelledby={`${occasion.id}-heading`}
      className={
        isNow
          ? "rounded-2xl border border-accent-green/35 bg-base-850 p-4 shadow-glow sm:p-5"
          : "rounded-2xl border border-base-700 bg-base-900 p-4 sm:p-5"
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          {isNow ? (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green shadow-[0_0_8px_rgba(61,220,151,0.9)]"
            />
          ) : null}
          <h2
            id={`${occasion.id}-heading`}
            className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
              isNow ? "text-accent-green" : "text-ink-lo"
            }`}
          >
            {isNow ? "Now" : "Tonight"} · {occasion.label}
          </h2>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
            isNow ? "text-accent-green/80" : "text-ink-lo"
          }`}
        >
          {occasion.timing}
        </span>
      </header>

      <p className="mt-2.5 text-[15px] leading-snug text-ink-hi">{occasion.headline}</p>

      <div
        role="radiogroup"
        aria-label={`${occasion.label} options — choose one`}
        className="mt-4 flex flex-col gap-2"
      >
        {occasion.options.map((o) => {
          const chosen = chosenId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setChosenId(chosen ? null : o.id)}
              className={`group flex min-h-[44px] w-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-colors duration-150 ${
                chosen
                  ? "border-accent-green/55 bg-accent-green/[0.07]"
                  : "border-transparent bg-base-800/45 hover:bg-base-800/80"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-md bg-base-700 px-1.5 py-[3px] font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-ink-mid">
                  {CHANNEL_LABEL[o.channel]}
                </span>
                <span className="font-mono text-[10px] tracking-[0.04em] text-ink-lo">
                  {o.effort}
                </span>
              </div>

              <div>
                <p className="text-[15px] font-semibold leading-snug text-ink-hi">{o.what}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-lo">{o.detail}</p>
              </div>

              <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-baseline gap-1.5">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
                    Protein
                  </dt>
                  <dd>
                    <AmountValue amount={o.protein} label="protein" size="sm" />
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
                    Carbs
                  </dt>
                  <dd>
                    <AmountValue amount={o.carbs} label="carbohydrate" size="sm" withChip={false} />
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="text-[13px] leading-relaxed text-ink-mid">{o.why}</p>
                <span
                  className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase leading-none tracking-[0.12em] transition-colors duration-150 ${
                    chosen
                      ? "border-accent-green bg-accent-green/15 text-accent-green"
                      : "border-base-600 text-ink-mid group-hover:border-accent-green/60 group-hover:text-accent-green"
                  }`}
                >
                  {chosen ? (
                    <>
                      {/* An SVG, not a "✓" character: the monospace stack has no
                          glyph for it and rendered a tofu box in the browser. */}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2.5 6.5 L4.8 8.8 L9.5 3.5" />
                      </svg>
                      Chosen
                    </>
                  ) : (
                    "I'll have this"
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
