/**
 * How the day is going.
 *
 * Three things here are deliberate and easy to get wrong.
 *
 * 1. Being behind is drawn in neutral ink, never red. The palette reserves
 *    accent-red for the medical never-suspends card, and 93g of protein still to
 *    eat is a state with a plan attached, not a failure. No warning colour, no
 *    exclamation, no streak.
 *
 * 2. The bar draws its own uncertainty. Logged protein is 72–82g because lunch
 *    was estimated, so the fill has a solid segment up to the guaranteed 72g and
 *    a softer band across the 10g that depends on how big that restaurant bowl
 *    actually was. Painting a single edge at 82g would be the optimistic end of a
 *    guess presented as a measurement — the exact lie this screen exists to avoid.
 *
 * 3. Protein is the hero and carbs and calories are not. The first pass gave all
 *    three identical weight, which left the card with no answer to "what am I
 *    looking at" — protein is the number the whole day is being reshaped around,
 *    so it is the only one set large.
 */

import { AmountValue } from "@/components/today/amount";
import type { Amount } from "@/lib/today/fixture";

function pct(n: number, of: number) {
  return Math.max(0, Math.min(100, (n / of) * 100));
}

function UncertaintyBar({
  low,
  high,
  target,
  label,
}: {
  low: number;
  high: number;
  target: number;
  label: string;
}) {
  const lowPct = pct(low, target);
  const highPct = pct(high, target);
  const met = low >= target;

  return (
    <div
      role="progressbar"
      aria-valuenow={low}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-label={`${label}: at least ${low} of ${target} grams, possibly up to ${high}`}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-base-800"
    >
      {/* Guaranteed: everything up to the low end of the range. */}
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${met ? "bg-accent-green" : "bg-ink-lo"}`}
        style={{ width: `${lowPct}%` }}
      />
      {/* The part that rests on an estimate. Same hue, visibly less certain. */}
      {highPct > lowPct ? (
        <div
          className="absolute inset-y-0 rounded-full bg-ink-lo/35"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
      ) : null}
    </div>
  );
}

function bounds(a: Amount) {
  return a.known === "exact" ? { low: a.g, high: a.g } : { low: a.lowG, high: a.highG };
}

export function DayState({
  protein,
  proteinTarget,
  proteinNote,
  carbs,
  carbTarget,
  carbNote,
  calorieNote,
}: {
  protein: Amount;
  proteinTarget: number;
  proteinNote: string;
  carbs: Amount;
  carbTarget: number;
  carbNote: string;
  calorieNote: string;
}) {
  const p = bounds(protein);
  const c = bounds(carbs);

  return (
    <section
      aria-labelledby="day-state-heading"
      className="rounded-2xl border border-base-700 bg-base-900 p-4 sm:p-5"
    >
      <h2
        id="day-state-heading"
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo"
      >
        How today is going
      </h2>

      {/* Protein — the number the day is being reshaped around. */}
      <div className="mt-4">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">Protein</h3>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <AmountValue amount={protein} label="protein" size="lg" withChip={false} />
          <span className="font-mono text-[13px] tabular-nums text-ink-lo">
            of {proteinTarget}g
          </span>
        </p>
        <div className="mt-3">
          <UncertaintyBar low={p.low} high={p.high} target={proteinTarget} label="Protein" />
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">{proteinNote}</p>
      </div>

      <div className="mt-5 flex flex-col gap-5 border-t border-base-800 pt-5">
        {/* Carbs — context, not headline. */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">Carbs</h3>
            <p className="flex items-baseline gap-1.5">
              <AmountValue amount={carbs} label="carbohydrate" size="md" withChip={false} />
              <span className="font-mono text-[12px] tabular-nums text-ink-lo">
                of {carbTarget}g
              </span>
            </p>
          </div>
          <div className="mt-2">
            <UncertaintyBar low={c.low} high={c.high} target={carbTarget} label="Carbs" />
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">{carbNote}</p>
        </div>

        {/*
          Calories get no number. Nothing on this screen establishes a kcal figure,
          and the honest rendering of "we know the direction but not the value" is a
          stated direction — not a plausible-looking number nobody measured.
        */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
              Calories
            </h3>
            <span className="text-[15px] leading-none text-ink-hi">On track</span>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">{calorieNote}</p>
        </div>
      </div>

      {/*
        States the convention once. An earlier version rendered a sample chip here
        by constructing a zero-gram estimated `Amount` purely for decoration — a
        fake value built to satisfy a component's prop type is exactly how bogus
        data ends up somewhere load-bearing later, so it says it in words instead.
      */}
      <p className="mt-5 border-t border-base-800 pt-3.5 text-[12px] leading-relaxed text-ink-lo">
        Ranges appear wherever a number rests on an estimate, and a total stays as soft as its
        softest row.
      </p>
    </section>
  );
}
