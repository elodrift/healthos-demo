/**
 * A time of day in 24-hour `HH:MM`. A Plan covers exactly one day, so a
 * Directive is placed by its time of day rather than by a full timestamp.
 */
export type TimeOfDay = string;

/**
 * One of the fixed structural blocks the Athlete's day is divided into.
 *
 * `share` is the percentage of the day's Targets this Slot carries, as a whole
 * number. Percentages rather than fractions because `180 * 0.35` is
 * 62.99999999999999 while `180 * 35 / 100` is 63.
 */
export interface Slot {
  id: string;
  at: TimeOfDay;
  share: number;
}

/** A long-horizon outcome, stated in words. It selects which Targets matter. */
export type Goal = "fatLoss";

/**
 * The full nutritional cost of one eating event. Widens in later cycles to
 * carry saturated fat, purine and fructose load, and Glycaemic Load.
 */
export type Footprint = Macros;

/** One pre-costed eating option. The closed set a Swap may draw from. */
export interface Meal {
  id: string;
  footprint: Footprint;
}

/** The durable facts HealthOS plans from. */
export interface Profile {
  goal: Goal;
  meals: Meal[];
  slots: Slot[];
}

/** A quantity of each Macro, in grams. */
export interface Macros {
  protein: number;
  carbohydrate: number;
  fat: number;
}

/** One prescribed action placed at a time in a Plan. */
export interface Directive {
  slotId: string;
  at: TimeOfDay;
  targets: Macros;
}

/** The full set of Directives for one day, ordered in time. */
export interface Plan {
  targets: Macros;
  headroom: Macros;
  directives: Directive[];
}

/**
 * The Macro Timeline: the mapping that turns a Goal into the day's Targets.
 *
 * It lives in the engine rather than the Profile for the same reason the Cap
 * rules do (ADR-0003) — the translation from objective to numbers is the
 * product, not configuration.
 */
const MACRO_TIMELINE: Record<Goal, Macros> = {
  // A 2,000 kcal day.
  fatLoss: { protein: 180, carbohydrate: 170, fat: 65 },
};

/**
 * The Athlete's tap asserting a Directive happened as prescribed.
 *
 * It records which Meal was confirmed rather than looking it up in the Plan:
 * ADR-0002 makes past Plans unstable as the rules evolve, and what the Athlete
 * actually ate must not change retroactively with them.
 */
export interface Confirmation {
  kind: "confirmation";
  slotId: string;
  mealId: string;
  at: TimeOfDay;
}

/** The append-only record of every Confirmation and Deviation. */
export type Ledger = readonly Confirmation[];

/** The Footprint of what a Ledger row consumed. */
const footprintOf = (profile: Profile, row: Confirmation): Footprint => {
  const meal = profile.meals.find((candidate) => candidate.id === row.mealId);
  if (!meal) {
    throw new Error(`Confirmed Meal "${row.mealId}" is not in the Profile`);
  }
  return meal.footprint;
};

/**
 * The portion of `macros` a Slot carries, from its share of `outOf`.
 *
 * Multiply before dividing: `180 * 35 / 100` is 63, where `180 * 0.35` is
 * 62.99999999999999.
 */
const shareOf = (macros: Macros, share: number, outOf: number): Macros => ({
  protein: (macros.protein * share) / outOf,
  carbohydrate: (macros.carbohydrate * share) / outOf,
  fat: (macros.fat * share) / outOf,
});

/**
 * Derives the Plan for the day containing `now`. Pure: the same Profile,
 * Ledger and clock always produce the same Plan (ADR-0002).
 *
 * `now` is not yet consumed — nothing in this cycle depends on the hour.
 */
export const derivePlan = (
  profile: Profile,
  ledger: Ledger,
  now: Date,
): Plan => {
  const totalShare = profile.slots.reduce((sum, slot) => sum + slot.share, 0);
  if (totalShare !== 100) {
    throw new Error(`Slot shares must total 100, got ${totalShare}`);
  }

  const targets = MACRO_TIMELINE[profile.goal];

  const headroom = ledger.reduce<Macros>((remaining, row) => {
    const spent = footprintOf(profile, row);
    return {
      protein: remaining.protein - spent.protein,
      carbohydrate: remaining.carbohydrate - spent.carbohydrate,
      fat: remaining.fat - spent.fat,
    };
  }, targets);

  const isSpent = (slot: Slot) =>
    ledger.some((row) => row.slotId === slot.id);

  const remainingShare = profile.slots
    .filter((slot) => !isSpent(slot))
    .reduce((sum, slot) => sum + slot.share, 0);

  const directives = [...profile.slots]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((slot) => ({
      slotId: slot.id,
      at: slot.at,
      // A Slot already answered for keeps the Targets it was prescribed with;
      // the Plan records what it asked for. The Slots still to come divide
      // what is actually left.
      targets: isSpent(slot)
        ? shareOf(targets, slot.share, 100)
        : shareOf(headroom, slot.share, remainingShare),
    }));

  return { targets, headroom, directives };
};
