import { expect, it } from "vitest";

import { derivePlan } from "./derive-plan";
import type { Profile } from "./derive-plan";

/**
 * Slots are deliberately declared out of chronological order: the Plan is
 * responsible for the ordering, not the Profile that describes the day.
 */
const profile: Profile = {
  slots: [
    { id: "dinner", at: "19:00" },
    { id: "breakfast", at: "07:00" },
    { id: "eveningSnack", at: "16:00" },
    { id: "lunch", at: "13:00" },
  ],
};

it("places one Directive in each Slot, ordered in time", () => {
  const plan = derivePlan(profile, [], new Date("2026-09-09T06:00:00"));

  expect(plan.directives).toEqual([
    { slotId: "breakfast", at: "07:00" },
    { slotId: "lunch", at: "13:00" },
    { slotId: "eveningSnack", at: "16:00" },
    { slotId: "dinner", at: "19:00" },
  ]);
});
