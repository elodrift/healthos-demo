"use client";

/**
 * Today's logged meals and their running total.
 *
 * The total is labelled as the sum of estimates, not as intake. Adding four
 * guesses together does not produce a measurement, and the wording here is the
 * only thing stopping a column of numbers from implying that it did.
 */

import useSWR from "swr";

interface Meal {
  id: number;
  description: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  confidence: string;
  source: string;
  photoPathname: string | null;
  loggedAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json() as Promise<{ day: string; meals: Meal[] }>;
};

function sum(meals: Meal[], key: "kcal" | "proteinG" | "carbG" | "fatG") {
  return Math.round(meals.reduce((n, m) => n + (m[key] ?? 0), 0));
}

export function MealsToday({ refreshKey }: { refreshKey: number }) {
  // The browser's zone decides which day this is; the server must not guess it.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error, isLoading } = useSWR(
    // refreshKey is part of the cache key so logging a meal refetches instead of
    // showing a stale list from before the write.
    [`/api/meals?tz=${encodeURIComponent(tz)}`, refreshKey],
    ([url]) => fetcher(url),
  );

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-base-700 bg-base-850 p-4">
        <p className="text-[13px] text-ink-lo">Loading today&apos;s meals…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-2xl border border-base-700 bg-base-850 p-4">
        <p role="alert" className="text-[13px] leading-relaxed text-ink-mid">
          Today&apos;s meals could not be loaded. They are saved — this is only the list failing to read.
        </p>
      </section>
    );
  }

  if (data.meals.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-base-700 p-4">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink-mid">Nothing logged today</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-lo">
          Add a photo above, or type a meal in by hand. Both end up as estimates.
        </p>
      </section>
    );
  }

  const totals = {
    kcal: sum(data.meals, "kcal"),
    protein: sum(data.meals, "proteinG"),
    carbs: sum(data.meals, "carbG"),
    fat: sum(data.meals, "fatG"),
  };

  return (
    <section className="rounded-2xl border border-base-700 bg-base-850 p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-hi">Today</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          {data.meals.length} {data.meals.length === 1 ? "meal" : "meals"}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {data.meals.map((meal) => (
          <li key={meal.id} className="flex items-start gap-2.5 rounded-xl border border-base-700 bg-base-900 p-2.5">
            {meal.photoPathname ? (
              /* eslint-disable-next-line @next/next/no-img-element -- authenticated stream, not a static asset */
              <img
                src={`/api/meal-photo?pathname=${encodeURIComponent(meal.photoPathname)}`}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg border border-base-700 object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-base-600"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-hi">{meal.description}</p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-lo">
                {Math.round(meal.kcal ?? 0)} kcal · {Math.round(meal.proteinG ?? 0)}p ·{" "}
                {Math.round(meal.carbG ?? 0)}c · {Math.round(meal.fatG ?? 0)}f
              </p>
            </div>
            {/* Low confidence is worth surfacing in the list; medium is the norm
                and labelling every row would just be noise. */}
            {meal.confidence === "LOW" ? (
              <span className="shrink-0 rounded border border-base-600 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-lo">
                low
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <dl className="mt-3 border-t border-base-700 pt-3">
        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          Sum of estimates
        </dt>
        <dd className="mt-1 font-mono text-[15px] text-ink-hi">
          {totals.kcal} kcal · {totals.protein}g protein
        </dd>
        <dd className="mt-1 font-mono text-[11px] text-ink-lo">
          {totals.carbs}g carbs · {totals.fat}g fat
        </dd>
        {/*
          The honest caveat, stated where the total is read rather than buried in
          a policy page. Four stacked estimates carry more error than any one of
          them, and the sum should not look more solid than its parts.
        */}
        <dd className="mt-2 text-[12px] leading-relaxed text-ink-lo">
          These are estimates added together, not a measured intake. Treat the protein figure as the
          one worth acting on.
        </dd>
      </dl>
    </section>
  );
}
