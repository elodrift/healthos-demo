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

/** The durable facts HealthOS plans from. */
export interface Profile {
  goal: Goal;
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

/** The append-only record of every Confirmation and Deviation. */
export type Ledger = never[];

/** The portion of the day's Targets a Slot carries, from its percentage share. */
const shareOf = (targets: Macros, share: number): Macros => ({
  protein: (targets.protein * share) / 100,
  carbohydrate: (targets.carbohydrate * share) / 100,
  fat: (targets.fat * share) / 100,
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
  const targets = MACRO_TIMELINE[profile.goal];

  const directives = [...profile.slots]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((slot) => ({
      slotId: slot.id,
      at: slot.at,
      targets: shareOf(targets, slot.share),
    }));

  return { targets, directives };
};
