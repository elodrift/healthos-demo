"use client";

/**
 * Today's logged meals measured against today's plan.
 *
 * This is the one place in the app where an estimate meets a target, so it is
 * the easiest place to accidentally lie. Three rules hold it honest:
 *
 *  1. The bar compares a *sum of estimates* to a target and says so. It is not
 *     a measurement of intake and must never be captioned as one.
 *  2. A floor and a target are different promises (§4.11). Clearing a 110g floor
 *     is a success; missing a 160g target is not. `proteinKind` decides the verb.
 *  3. Over the number reads neutral, never red. Being over on protein is
 *     information; the palette reserves accent-red for the medical safety card
 *     and the two must not look alike.
 */

import useSWR from "swr";
import type { DayTarget } from "@/lib/planner/propose-day";

interface Meal {
  id: number;
  proteinG: number | null;
  kcal: number | null;
  confidence: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed");
  return res.json() as Promise<{ day: string; meals: Meal[] }>;
};

export function LoggedAgainstTarget({ dayTarget }: { dayTarget: DayTarget }) {
  // The browser's zone decides which day this is; the server must not guess it.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error, isLoading } = useSWR(
    `/api/meals?tz=${encodeURIComponent(tz)}`,
    fetcher,
    // The plan is server-rendered per request, so a stale total sitting beside a
    // fresh plan is the confusing case worth spending a refetch to avoid.
    { revalidateOnFocus: true },
  );

  if (isLoading) {
    return (
      <section className="rounded-xl border border-base-700 bg-base-900 p-4">
        <p className="text-[13px] text-ink-lo">Checking what you have logged…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-xl border border-base-700 bg-base-900 p-4">
        <p role="alert" className="text-[13px] leading-relaxed text-ink-mid">
          Today&apos;s log could not be read, so this is the plan only. Your meals are saved.
        </p>
      </section>
    );
  }

  const logged = Math.round(data.meals.reduce((n, m) => n + (m.proteinG ?? 0), 0));
  const anyLow = data.meals.some((m) => m.confidence === "LOW");

  /*
    No protein figure in the plan. The logged total is still real, so it is shown
    without a bar — a progress bar needs a denominator, and inventing one (or
    quietly using a default) is exactly the §4.11 failure this screen exists to
    avoid. Showing nothing at all was the first attempt and was worse: it hid
    data the user had entered by hand.
  */
  if (dayTarget.proteinG === null) {
    return (
      <section className="rounded-xl border border-base-700 bg-base-900 p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          Logged today
        </h2>
        <p className="mt-2 font-mono text-[20px] leading-none text-ink-hi">
          {logged}
          <span className="text-ink-lo">g protein</span>
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">
          There is no protein target set yet, so this is a running total rather than progress
          towards anything.
        </p>
        <a
          href="/onboarding/goal"
          className="mt-3 inline-flex min-h-[44px] items-center text-[13px] font-semibold text-accent-green underline underline-offset-4"
        >
          Set a protein target
        </a>
      </section>
    );
  }

  const target = dayTarget.proteinG;
  const remaining = target - logged;
  const isFloor = dayTarget.proteinKind === "FLOOR";
  const met = logged >= target;

  // Clamped for width only. The real figures are always printed as text, so the
  // bar hitting its end can never be the only thing the user sees.
  const pct = Math.min(100, Math.round((logged / target) * 100));

  const anyLowConfidence = data.meals.some((m) => m.confidence === "LOW");

  return (
    <section className="rounded-xl border border-base-700 bg-base-900 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          {isFloor ? "Protein floor" : "Protein target"}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          {data.meals.length} logged
        </span>
      </div>

      <p className="mt-2 font-mono text-[20px] leading-none text-ink-hi">
        {logged}
        <span className="text-ink-lo">/{target}g</span>
      </p>

      <div
        role="progressbar"
        aria-valuenow={logged}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${logged} of ${target} grams of protein logged`}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-base-800"
      >
        <div
          className={`h-full rounded-full ${met ? "bg-accent-green" : "bg-ink-lo"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">
        {met
          ? isFloor
            ? `Floor cleared, with ${logged - target}g over it.`
            : `Target met, ${logged - target}g over.`
          : isFloor
            ? `${remaining}g under the floor — the one number worth closing today.`
            : `${remaining}g to go.`}
      </p>

      {/*
        The caveat travels with the number, not a policy page. Stacked estimates
        carry more error than any one of them, and this bar is built entirely
        out of stacked estimates.
      */}
      <p className="mt-2 text-[12px] leading-relaxed text-ink-lo">
        {data.meals.length === 0
          ? "Nothing logged yet today."
          : `Added from ${data.meals.length} ${
              data.meals.length === 1 ? "estimate" : "estimates"
            }, not measured intake.${
              anyLowConfidence ? " One or more was low confidence." : ""
            }`}
      </p>
    </section>
  );
}
