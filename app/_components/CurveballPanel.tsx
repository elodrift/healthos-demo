"use client";

import { useMemo, useState } from "react";

import type {
  Confirmation,
  Deviation,
  Directive,
  Footprint,
  Ledger,
} from "@/src/engine/derive-plan";

type Level = "low" | "medium" | "high";

const LEVELS: Level[] = ["low", "medium", "high"];

const MACRO_GRAMS: Record<"carbohydrate" | "fat" | "protein", Record<Level, number>> =
  {
    carbohydrate: { low: 18, medium: 50, high: 92 },
    fat: { low: 8, medium: 18, high: 36 },
    protein: { low: 16, medium: 40, high: 68 },
  };

const SAT_FAT: Record<Level, number> = {
  low: 2,
  medium: 7,
  high: 14,
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  eveningSnack: "Snack",
  dinner: "Dinner",
};

const timeOfDay = (now: Date) =>
  `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

function LevelControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Level;
  onChange: (next: Level) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        <p className="text-xs capitalize text-zinc-500">{value}</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-stone-100 p-1">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`rounded-full py-1.5 text-xs font-medium capitalize transition ${
              value === level
                ? "bg-white text-teal-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {level === "medium" ? "Med" : level}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CurveballPanel({
  directives,
  ledger,
  now,
  onAppend,
}: {
  directives: Directive[];
  ledger: Ledger;
  now: Date;
  onAppend: (row: Confirmation | Deviation) => void;
}) {
  const [carbs, setCarbs] = useState<Level>("medium");
  const [fats, setFats] = useState<Level>("medium");
  const [protein, setProtein] = useState<Level>("medium");

  const openSlots = directives.filter(
    (directive) =>
      !ledger.some((row) => row.slotId === directive.slotId) &&
      directive.state !== "unactioned",
  );

  const [slotId, setSlotId] = useState<string>("");
  const activeSlot = openSlots.some((slot) => slot.slotId === slotId)
    ? slotId
    : (openSlots[0]?.slotId ?? "");

  const footprint: Footprint = useMemo(
    () => ({
      protein: MACRO_GRAMS.protein[protein],
      carbohydrate: MACRO_GRAMS.carbohydrate[carbs],
      fat: MACRO_GRAMS.fat[fats],
      saturatedFat: SAT_FAT[fats],
    }),
    [carbs, fats, protein],
  );

  const logDeviation = () => {
    if (!activeSlot) return;
    onAppend({
      kind: "deviation",
      slotId: activeSlot,
      footprint,
      at: timeOfDay(now),
    });
  };

  return (
    <aside className="h-full rounded-3xl bg-white p-6 shadow-[0_1px_0_rgba(28,25,23,0.04)] ring-1 ring-stone-200/80">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
        Curveball Panel
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">
        Macro Deviation Log
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        A Deviation is an input, never a failure. Log what actually happened and
        the remaining Directives Reroute under the Caps.
      </p>

      <label className="mt-6 block text-sm font-medium text-zinc-800">
        Apply to Slot
        <select
          className="mt-2 w-full rounded-2xl border-0 bg-stone-50 px-3 py-2.5 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-teal-800"
          value={activeSlot}
          onChange={(event) => setSlotId(event.target.value)}
          disabled={openSlots.length === 0}
        >
          {openSlots.length === 0 ? (
            <option value="">No open Slots</option>
          ) : (
            openSlots.map((directive) => (
              <option key={directive.slotId} value={directive.slotId}>
                {SLOT_LABELS[directive.slotId] ?? directive.slotId} ·{" "}
                {directive.at}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="mt-6 flex flex-col gap-5">
        <LevelControl label="Carbs" value={carbs} onChange={setCarbs} />
        <LevelControl label="Fats" value={fats} onChange={setFats} />
        <LevelControl label="Protein" value={protein} onChange={setProtein} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 text-xs text-zinc-500">
        <div className="rounded-2xl bg-stone-50 px-3 py-2">
          <dt>Footprint</dt>
          <dd className="mt-0.5 font-medium text-zinc-800 tabular-nums">
            {footprint.protein} / {footprint.carbohydrate} / {footprint.fat} g
          </dd>
        </div>
        <div className="rounded-2xl bg-stone-50 px-3 py-2">
          <dt>Saturated fat</dt>
          <dd className="mt-0.5 font-medium text-zinc-800 tabular-nums">
            {footprint.saturatedFat} g
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={logDeviation}
        disabled={!activeSlot}
        className="mt-6 w-full rounded-full bg-zinc-900 px-4 py-3 text-sm font-medium text-stone-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-zinc-400"
      >
        Log deviation
      </button>
    </aside>
  );
}
