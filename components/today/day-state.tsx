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

/**
 * The estimated segment is a diagonal hatch, not a faded copy of the solid one.
 *
 * The first version separated "logged" from "estimated" by opacity alone
 * (`bg-ink-lo` against `bg-ink-lo/35`) and at 390px on a 6px bar the two
 * collapsed into a single slightly-uneven stripe — the encoding was there in the
 * markup and absent to the eye. Hatch survives at small sizes because it differs
 * in *kind* rather than degree, so it cannot merge into its neighbour however
 * close the values sit. Literal rgba here on purpose: this project is Tailwind v3,
 * where `var(--color-*)` in an inline style silently renders nothing.
 */
const HATCH_INK = `repeating-linear-gradient(115deg, rgba(242,246,252,0.62) 0 3px, rgba(242,246,252,0.10) 3px 7px)`;
const HATCH_GREEN = `repeating-linear-gradient(115deg, rgba(61,220,151,0.68) 0 3px, rgba(61,220,151,0.12) 3px 7px)`;

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
      /* 10px, not 6px: two distinguishable states need the room to be distinguishable. */
      className="relative h-2.5 w-full overflow-hidden rounded-full bg-base-800 ring-1 ring-inset ring-base-700"
    >
      {/* Guaranteed: everything up to the low end of the range. Full-strength ink. */}
      <div
        className={`absolute inset-y-0 left-0 rounded-l-full ${
          met ? "bg-accent-green" : "bg-ink-hi"
        } ${highPct <= lowPct ? "rounded-r-full" : ""}`}
        style={{ width: `${lowPct}%` }}
      />
      {/* The part that rests on an estimate. */}
      {highPct > lowPct ? (
        <div
          className="absolute inset-y-0 rounded-r-full"
          style={{
            left: `${lowPct}%`,
            width: `${highPct - lowPct}%`,
            backgroundImage: met ? HATCH_GREEN : HATCH_INK,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Shows the two states rather than only describing them. These swatches carry no
 * quantity, so they are not the "fake Amount built to satisfy a prop type" that an
 * earlier pass rightly removed — they are the key to the encoding, which is the
 * one thing on this screen that must never be the quietest element.
 */
function BarLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] leading-relaxed text-ink-mid">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2.5 w-7 rounded-full bg-ink-hi" />
        Logged
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-7 rounded-full ring-1 ring-inset ring-base-700"
          style={{ backgroundImage: HATCH_INK }}
        />
        Estimated range
      </span>
    </p>
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
        States the convention once — and at the same weight as every other piece of
        body copy. It sat at 12px/ink-lo, which made the sentence that teaches the
        whole visual language the faintest text on the screen.
      */}
      <div className="mt-5 flex flex-col gap-2.5 border-t border-base-800 pt-4">
        <BarLegend />
        <p className="text-[13px] leading-relaxed text-ink-mid">
          Ranges appear wherever a number rests on an estimate, and a total stays as soft as its
          softest row.
        </p>
      </div>
    </section>
  );
}
