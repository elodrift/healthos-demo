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
  slots: [
    { id: "dinner", at: "19:00", share: 35 },
    { id: "breakfast", at: "07:00", share: 25 },
    { id: "eveningSnack", at: "16:00", share: 10 },
    { id: "lunch", at: "13:00", share: 30 },
  ],
};

const morning = new Date("2026-09-09T06:00:00");

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
  expect(plan.directives).toEqual([
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
