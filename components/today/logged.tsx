/**
 * What has actually been eaten, with the provenance kept next to each row.
 *
 * The chip sits on the row rather than in a legend at the bottom of the screen,
 * because the caveat has to travel with the number it qualifies. A legend lets a
 * reader take the precise-looking figure and leave the qualification behind.
 */

import { AmountValue } from "@/components/today/amount";
import type { LoggedMeal } from "@/lib/today/fixture";

export function Logged({ meals }: { meals: LoggedMeal[] }) {
  return (
    <section
      aria-labelledby="logged-heading"
      className="rounded-2xl border border-base-700 bg-base-900 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="logged-heading"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo"
        >
          Logged so far
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          {meals.length} meals
        </span>
      </div>

      <ul className="mt-3.5 flex flex-col">
        {meals.map((m, i) => (
          <li
            key={m.id}
            className={`flex flex-col gap-2 py-3.5 ${
              i > 0 ? "border-t border-base-800" : "pt-0"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
                {m.slot}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-ink-lo">{m.at}</span>
            </div>

            <div>
              <p className="text-[15px] leading-snug text-ink-hi">{m.what}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-lo">{m.where}</p>
            </div>

            <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-baseline gap-1.5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
                  Protein
                </dt>
                <dd>
                  <AmountValue amount={m.protein} label="protein" size="sm" />
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
                  Carbs
                </dt>
                <dd>
                  <AmountValue amount={m.carbs} label="carbohydrate" size="sm" withChip={false} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
