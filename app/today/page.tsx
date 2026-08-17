import type { Metadata } from "next";
import { DayState } from "@/components/today/day-state";
import { Logged } from "@/components/today/logged";
import { OccasionCard } from "@/components/today/occasion";
import { WhyChanged } from "@/components/today/why-changed";
import {
  CARB_TARGET_G,
  CARBS_LOGGED,
  DAY_LABEL,
  DAY_STATUS,
  DINNER,
  formatAmount,
  LOGGED,
  NOW,
  PROTEIN_LOGGED,
  PROTEIN_REMAINING,
  PROTEIN_TARGET_G,
  remainingTo,
  SNACK,
  WHY_CHANGED,
} from "@/lib/today/fixture";

export const metadata: Metadata = {
  title: "Today — HealthOS",
  description:
    "What to eat next, why the plan changed, and how today is going — with every number labelled by how it is known.",
};

/**
 * The Today screen. Fake data only: no fetch, no database, no session. Every
 * figure comes from `lib/today/fixture`, and the totals are derived there rather
 * than typed out beside the rows they summarise.
 *
 * The screen answers three questions in a fixed order, which is why the sections
 * are laid out top to bottom rather than in a grid:
 *
 *   1. What now?            — the open snack window, then tonight's plan
 *   2. How is today going?  — macros and the rows they were built from
 *   3. Why did it change?   — one plain sentence, given its own card
 *
 * Only one element is loud: the Now card, which carries the accent border, the
 * live dot and the glow. Everything else is hairline borders on near-black. A
 * second emphasised card would make the first one ordinary.
 */
export default function TodayPage() {
  const carbsRemaining = remainingTo(CARB_TARGET_G, CARBS_LOGGED);

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-3.5 px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <header className="mb-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold leading-none tracking-[-0.01em] text-ink-hi">
            Today
          </h1>
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-lo">
              {DAY_LABEL}
            </span>
            <span className="font-mono text-[13px] tabular-nums text-ink-mid">{NOW}</span>
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-base-800 px-2.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-ink-mid">
            Training day
          </span>
          <span className="rounded-full bg-base-800 px-2.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-ink-lo">
            Trained 07:00
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">{DAY_STATUS}</p>
      </header>

      {/* 1 — What now. The open window first, the evening beneath it. */}
      <OccasionCard occasion={SNACK} />
      <OccasionCard occasion={DINNER} />

      {/* 2 — How today is going. */}
      <DayState
        protein={PROTEIN_LOGGED}
        proteinTarget={PROTEIN_TARGET_G}
        proteinNote={`${formatAmount(PROTEIN_REMAINING)} to go. The snack window and dinner above cover it.`}
        carbs={CARBS_LOGGED}
        carbTarget={CARB_TARGET_G}
        carbNote={`${formatAmount(carbsRemaining)} left, which is normal this early on a training day — the evening plate carries most of it.`}
        calorieNote="Sitting where a training day should by mid-afternoon. Nothing today measured a calorie figure, so this is a direction read from the rows below, not a count."
      />

      <Logged meals={LOGGED} />

      {/* 3 — Why it changed. */}
      <WhyChanged
        sentence={WHY_CHANGED}
        mechanism="Lunch was planned at 52g of protein and came in at 38–48g. That left more of the day's protein than expected for the evening, which is more than one meal at 19:00 comfortably carries — so a window opened now and dinner took the rest."
      />
    </main>
  );
}
