"use client";

import { useMemo, useState } from "react";

import {
  derivePlan,
  type Confirmation,
  type Deviation,
  type Ledger,
  type Meal,
  type Profile,
} from "@/src/engine/derive-plan";
import { CurveballPanel } from "./CurveballPanel";
import { MetricsBanner } from "./MetricsBanner";
import { TimelineGrid } from "./TimelineGrid";

const DEMO_PROFILE: Profile = {
  goal: "fatLoss",
  biomarkers: ["highCholesterol"],
  meals: [
    {
      id: "oats",
      footprint: { protein: 30, carbohydrate: 65, fat: 20, saturatedFat: 4 },
    },
    {
      id: "chickenSalad",
      footprint: { protein: 60, carbohydrate: 42, fat: 18, saturatedFat: 3 },
    },
    {
      id: "greekYogurt",
      footprint: { protein: 20, carbohydrate: 14, fat: 6, saturatedFat: 2 },
    },
    {
      id: "salmonRice",
      footprint: { protein: 70, carbohydrate: 49, fat: 21, saturatedFat: 5 },
    },
  ],
  slots: [
    { id: "dinner", at: "19:00", share: 35 },
    { id: "breakfast", at: "07:00", share: 25 },
    { id: "eveningSnack", at: "16:00", share: 10 },
    { id: "lunch", at: "13:00", share: 30 },
  ],
};

const CLOCK_PRESETS: { label: string; at: Date }[] = [
  { label: "Morning", at: new Date("2026-09-10T06:00:00") },
  { label: "After lunch", at: new Date("2026-09-10T13:30:00") },
  { label: "Late afternoon", at: new Date("2026-09-10T17:00:00") },
  { label: "Evening", at: new Date("2026-09-10T20:00:00") },
];

const timeOfDay = (now: Date) =>
  `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

export function Dashboard({
  ledger,
  now,
  onAppend,
  onNowChange,
}: {
  ledger: Ledger;
  now: Date;
  onAppend: (row: Confirmation | Deviation) => void;
  onNowChange: (next: Date) => void;
}) {
  const plan = useMemo(
    () => derivePlan(DEMO_PROFILE, ledger, now),
    [ledger, now],
  );

  const [swappedMealBySlot, setSwappedMealBySlot] = useState<
    Record<string, string>
  >({});

  const mealById = (id: string) =>
    DEMO_PROFILE.meals.find((meal) => meal.id === id) ?? null;

  const displayedMeal = (slotId: string, prescribed: Meal | null): Meal | null => {
    const swapped = swappedMealBySlot[slotId];
    if (swapped) return mealById(swapped);
    return prescribed;
  };

  const isSpent = (slotId: string) =>
    ledger.some((row) => row.slotId === slotId);

  const confirm = (slotId: string, meal: Meal) => {
    if (isSpent(slotId)) return;
    onAppend({
      kind: "confirmation",
      slotId,
      mealId: meal.id,
      at: timeOfDay(now),
    });
    setSwappedMealBySlot((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  };

  const swapMeal = (slotId: string, current: Meal | null) => {
    if (isSpent(slotId) || DEMO_PROFILE.meals.length === 0) return;
    const currentId = swappedMealBySlot[slotId] ?? current?.id;
    const index = DEMO_PROFILE.meals.findIndex((meal) => meal.id === currentId);
    const next = DEMO_PROFILE.meals[(index + 1) % DEMO_PROFILE.meals.length];
    setSwappedMealBySlot((prev) => ({ ...prev, [slotId]: next.id }));
  };

  return (
    <div className="min-h-full bg-stone-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-teal-800/70">
              HealthOS
            </p>
            <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight">
              Today&apos;s Plan
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
              Directives for the Athlete, derived from Profile, Ledger, and clock.
              Confirm as prescribed, or log a Deviation — the afternoon Reroutes.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Simulated clock
            </p>
            <div className="flex flex-wrap gap-2">
              {CLOCK_PRESETS.map((preset) => {
                const active = preset.at.getTime() === now.getTime();
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onNowChange(preset.at)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "bg-teal-800 text-stone-50"
                        : "bg-white text-zinc-700 ring-1 ring-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <p className="font-mono text-sm text-zinc-500">{timeOfDay(now)}</p>
          </div>
        </header>

        <MetricsBanner plan={plan} />

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <TimelineGrid
              directives={plan.directives}
              ledger={ledger}
              meals={DEMO_PROFILE.meals}
              displayedMeal={displayedMeal}
              onConfirm={confirm}
              onSwap={swapMeal}
            />
          </div>
          <div className="lg:col-span-4">
            <CurveballPanel
              directives={plan.directives}
              ledger={ledger}
              now={now}
              onAppend={onAppend}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
