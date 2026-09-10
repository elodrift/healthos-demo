import { expect, it } from "vitest";

import { derivePlan } from "./derive-plan";
import type { Profile } from "./derive-plan";

/**
 * Slots are deliberately declared out of chronological order: the Plan is
 * responsible for the ordering, not the Profile that describes the day.
 * Shares are integer percentages and total 100.
 */
const profile: Profile = {
  goal: "fatLoss",
  biomarkers: ["highCholesterol"],
  meals: [
    { id: "oats", footprint: { protein: 30, carbohydrate: 65, fat: 20, saturatedFat: 4 } },
    { id: "chickenSalad", footprint: { protein: 60, carbohydrate: 42, fat: 18, saturatedFat: 3 } },
    { id: "greekYogurt", footprint: { protein: 20, carbohydrate: 14, fat: 6, saturatedFat: 2 } },
    { id: "salmonRice", footprint: { protein: 70, carbohydrate: 49, fat: 21, saturatedFat: 5 } },
  ],
  slots: [
    { id: "dinner", at: "19:00", share: 35 },
    { id: "breakfast", at: "07:00", share: 25 },
    { id: "eveningSnack", at: "16:00", share: 10 },
    { id: "lunch", at: "13:00", share: 30 },
  ],
};

const morning = new Date("2026-09-09T06:00:00");
const midMorning = new Date("2026-09-09T09:00:00");

/** Breakfast happened exactly as prescribed: the Athlete ate the oats. */
const breakfastConfirmed = [
  { kind: "confirmation", slotId: "breakfast", mealId: "oats", at: "07:05" },
] as const;

it("places one Directive in each Slot, ordered in time", () => {
  const plan = derivePlan(profile, [], morning);

  expect(plan.directives.map((directive) => directive.slotId)).toEqual([
    "breakfast",
    "lunch",
    "eveningSnack",
    "dinner",
  ]);
});

it("derives the day's Macro Targets from the Goal's Macro Timeline", () => {
  const plan = derivePlan(profile, [], morning);

  // Fat Loss resolves to a 2,000 kcal day: 180g protein, 170g carb, 65g fat.
  expect(plan.targets).toEqual({ protein: 180, carbohydrate: 170, fat: 65 });
});

it("splits the day's Macro Targets across the Slots by their share", () => {
  const plan = derivePlan(profile, [], morning);

  // Worked by hand from 180/170/65 at 25/30/10/35 percent.
  expect(
    plan.directives.map(({ slotId, at, targets }) => ({ slotId, at, targets })),
  ).toEqual([
    {
      slotId: "breakfast",
      at: "07:00",
      targets: { protein: 45, carbohydrate: 42.5, fat: 16.25 },
    },
    {
      slotId: "lunch",
      at: "13:00",
      targets: { protein: 54, carbohydrate: 51, fat: 19.5 },
    },
    {
      slotId: "eveningSnack",
      at: "16:00",
      targets: { protein: 18, carbohydrate: 17, fat: 6.5 },
    },
    {
      slotId: "dinner",
      at: "19:00",
      targets: { protein: 63, carbohydrate: 59.5, fat: 22.75 },
    },
  ]);
});

it("rejects a Profile whose Slot shares do not total 100", () => {
  const misconfigured: Profile = {
    ...profile,
    slots: profile.slots.map((slot) =>
      slot.id === "lunch" ? { ...slot, share: 25 } : slot,
    ),
  };

  expect(() => derivePlan(misconfigured, [], morning)).toThrow(
    "Slot shares must total 100, got 95",
  );
});

it("subtracts a confirmed Meal's Footprint from the day's Headroom", () => {
  const plan = derivePlan(profile, breakfastConfirmed, midMorning);

  // The day's 180/170/65, less the oats the Athlete confirmed at 07:05.
  expect(plan.headroom.macros).toEqual({ protein: 150, carbohydrate: 105, fat: 45 });
});

it("re-splits the remaining Headroom across the Slots still to come", () => {
  const plan = derivePlan(profile, breakfastConfirmed, midMorning);

  // Headroom 150/105/45 over the remaining 30/10/35 shares, renormalised
  // against the 75 left once breakfast's 25 is spent. Breakfast keeps the
  // Targets it was prescribed with — the Plan records what it asked for.
  expect(
    plan.directives.map(({ slotId, targets }) => ({ slotId, targets })),
  ).toEqual([
    { slotId: "breakfast", targets: { protein: 45, carbohydrate: 42.5, fat: 16.25 } },
    { slotId: "lunch", targets: { protein: 60, carbohydrate: 42, fat: 18 } },
    { slotId: "eveningSnack", targets: { protein: 20, carbohydrate: 14, fat: 6 } },
    { slotId: "dinner", targets: { protein: 70, carbohydrate: 49, fat: 21 } },
  ]);
});

it("closes out a fully confirmed day without dividing by an empty share", () => {
  const wholeDayConfirmed = [
    { kind: "confirmation", slotId: "breakfast", mealId: "oats", at: "07:05" },
    { kind: "confirmation", slotId: "lunch", mealId: "chickenSalad", at: "13:10" },
    { kind: "confirmation", slotId: "eveningSnack", mealId: "greekYogurt", at: "16:00" },
    { kind: "confirmation", slotId: "dinner", mealId: "salmonRice", at: "19:20" },
  ] as const;

  const plan = derivePlan(profile, wholeDayConfirmed, new Date("2026-09-09T20:00:00"));

  // These four Meals total exactly the day's 180/170/65.
  expect(plan.headroom.macros).toEqual({ protein: 0, carbohydrate: 0, fat: 0 });
  expect(
    plan.directives.flatMap(({ targets }) => Object.values(targets)),
  ).not.toContain(NaN);
});

it("rejects a Slot that carries no share of the day", () => {
  const withEmptySlot: Profile = {
    ...profile,
    // Still totals 100 — a Slot carrying nothing is its own kind of wrong.
    slots: [...profile.slots, { id: "midnightSnack", at: "23:00", share: 0 }],
  };

  expect(() => derivePlan(withEmptySlot, [], morning)).toThrow(
    'Slot "midnightSnack" carries no share of the day',
  );
});

/** Breakfast as prescribed; then an unprescribed burger with a client. */
const burgerForLunch = [
  { kind: "confirmation", slotId: "breakfast", mealId: "oats", at: "07:05" },
  {
    kind: "deviation",
    slotId: "lunch",
    at: "13:00",
    footprint: { protein: 42, carbohydrate: 51, fat: 27, saturatedFat: 12 },
  },
] as const;

const afternoon = new Date("2026-09-09T13:30:00");

it("consumes a Deviation's own Footprint, off-menu though it is", () => {
  const plan = derivePlan(profile, burgerForLunch, afternoon);

  // 180/170/65, less the oats and less the burger the Athlete actually ate.
  expect(plan.headroom.macros).toEqual({ protein: 108, carbohydrate: 54, fat: 18 });

  // The 10 and 35 shares still ahead, renormalised against the 45 that remain.
  expect(
    plan.directives
      .filter(({ slotId }) => slotId === "eveningSnack" || slotId === "dinner")
      .map(({ slotId, targets }) => ({ slotId, targets })),
  ).toEqual([
    { slotId: "eveningSnack", targets: { protein: 24, carbohydrate: 12, fat: 4 } },
    { slotId: "dinner", targets: { protein: 84, carbohydrate: 42, fat: 14 } },
  ]);
});

it("leaves the rest of the day no saturated fat once the Cap is spent", () => {
  const plan = derivePlan(profile, burgerForLunch, afternoon);

  // High Cholesterol caps the day at 15g. The oats spent 4g and the burger 12g,
  // so the Cap is already 1g past its ceiling — and Headroom on a Cap never
  // goes below zero.
  expect(plan.headroom.caps).toEqual({ saturatedFat: 0 });

  expect(
    plan.directives
      .filter(({ slotId }) => slotId === "eveningSnack" || slotId === "dinner")
      .map(({ slotId, caps }) => ({ slotId, caps })),
  ).toEqual([
    { slotId: "eveningSnack", caps: { saturatedFat: 0 } },
    { slotId: "dinner", caps: { saturatedFat: 0 } },
  ]);
});

it("prescribes the closest Meal in the closed set to each Slot's Targets", () => {
  const plan = derivePlan(profile, [], morning);

  // Selection runs through the day drawing on what is left of the 15g Cap:
  // 15 -> 12 -> 9 -> 7, so no Slot is starved by an invented per-Slot ceiling.
  expect(
    plan.directives.map(({ slotId, meal }) => ({
      slotId,
      meal: meal?.id ?? null,
    })),
  ).toEqual([
    { slotId: "breakfast", meal: "chickenSalad" },
    { slotId: "lunch", meal: "chickenSalad" },
    { slotId: "eveningSnack", meal: "greekYogurt" },
    { slotId: "dinner", meal: "salmonRice" },
  ]);

  expect(plan.directives.every(({ state }) => state === "onTarget")).toBe(true);
});

it("prescribes the least damaging Meal when the Cap leaves no legal one", () => {
  const plan = derivePlan(profile, burgerForLunch, afternoon);

  // The burger spent the Cap, so nothing in the closed set obeys it. The day
  // still gets prescribed: the lowest saturated fat available, flagged.
  expect(
    plan.directives
      .filter(({ slotId }) => slotId === "eveningSnack" || slotId === "dinner")
      .map(({ slotId, meal, state }) => ({ slotId, meal: meal?.id, state })),
  ).toEqual([
    { slotId: "eveningSnack", meal: "greekYogurt", state: "closestAchievable" },
    { slotId: "dinner", meal: "greekYogurt", state: "closestAchievable" },
  ]);
});

it("hands an unactioned past Slot's share to the Slots still ahead", () => {
  // 17:00: the 16:00 snack came and went with neither a Confirmation nor a
  // Deviation against it. Nothing was eaten, so nothing leaves Headroom.
  const plan = derivePlan(profile, burgerForLunch, new Date("2026-09-09T17:00:00"));
  const bySlot = Object.fromEntries(
    plan.directives.map((directive) => [directive.slotId, directive]),
  );

  expect(bySlot.eveningSnack.state).toBe("unactioned");
  expect(bySlot.eveningSnack.meal).toBeNull();

  // Dinner is the only Slot left, so it carries the whole 108/54/18 that
  // remains — the snack's 10 share is released rather than held back.
  expect(bySlot.dinner.targets).toEqual({
    protein: 108,
    carbohydrate: 54,
    fat: 18,
  });

  // A Slot answered for is never unactioned, however far in the past it sits.
  expect(bySlot.breakfast.state).toBe("onTarget");
  expect(bySlot.lunch.state).toBe("onTarget");
});
