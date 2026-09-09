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

/** The daily ceilings a day must stay under. Widens as Cap rules are added. */
export interface Caps {
  saturatedFat: number;
}

/**
 * The full nutritional cost of one eating event. Widens in later cycles to
 * carry purine and fructose load, and Glycaemic Load.
 */
export type Footprint = Macros & Caps;

/** A measured blood value HealthOS plans against, sitting outside its range. */
export type Biomarker = "highCholesterol";

/**
 * The Cap each Biomarker derives. In the engine rather than the Profile per
 * ADR-0003: translating blood work into a daily ceiling is the product, not
 * configuration. These thresholds are working assumptions and still owe a
 * clinical citation.
 */
const CAP_RULES: Record<Biomarker, Caps> = {
  highCholesterol: { saturatedFat: 15 },
};

/** One pre-costed eating option. The closed set a Swap may draw from. */
export interface Meal {
  id: string;
  footprint: Footprint;
}

/** The durable facts HealthOS plans from. */
export interface Profile {
  goal: Goal;
  biomarkers: Biomarker[];
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
  caps: Caps;
}

/**
 * What remains of the day's Targets and Caps after every Confirmation and
 * Deviation so far — the budget a Reroute has to work with.
 */
export interface Headroom {
  macros: Macros;
  caps: Caps;
}

/** The full set of Directives for one day, ordered in time. */
export interface Plan {
  targets: Macros;
  headroom: Headroom;
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

/**
 * A gap between what a Directive prescribed and what the Athlete actually did.
 *
 * It carries its own Footprint rather than a mealId: the closed set of Meals
 * constrains what HealthOS may prescribe, never what the Athlete may report.
 */
export interface Deviation {
  kind: "deviation";
  slotId: string;
  footprint: Footprint;
  at: TimeOfDay;
}

/** The append-only record of every Confirmation and Deviation. */
export type Ledger = readonly (Confirmation | Deviation)[];

/**
 * The Footprint of what a Ledger row consumed: a Confirmation resolves its
 * Meal in the Profile, a Deviation carries what was actually eaten.
 */
const footprintOf = (
  profile: Profile,
  row: Confirmation | Deviation,
): Footprint => {
  if (row.kind === "deviation") {
    return row.footprint;
  }

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

/** The portion of a Cap a Slot may draw on, from its share of `outOf`. */
const capShareOf = (caps: Caps, share: number, outOf: number): Caps => ({
  saturatedFat: (caps.saturatedFat * share) / outOf,
});

/**
 * The tightest Cap each Biomarker derives. Where two Biomarkers cap the same
 * axis the lower ceiling wins — a Cap is obeyed, so the strictest one governs.
 */
const capsFor = (biomarkers: Biomarker[]): Caps =>
  biomarkers.reduce<Caps>(
    (tightest, biomarker) => ({
      saturatedFat: Math.min(
        tightest.saturatedFat,
        CAP_RULES[biomarker].saturatedFat,
      ),
    }),
    { saturatedFat: Infinity },
  );

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
  // A Slot carrying none of the day has nothing to prescribe, and would divide
  // the remaining Headroom by an empty share once the rest of the day is spent.
  const empty = profile.slots.find((slot) => slot.share <= 0);
  if (empty) {
    throw new Error(`Slot "${empty.id}" carries no share of the day`);
  }

  const totalShare = profile.slots.reduce((sum, slot) => sum + slot.share, 0);
  if (totalShare !== 100) {
    throw new Error(`Slot shares must total 100, got ${totalShare}`);
  }

  const targets = MACRO_TIMELINE[profile.goal];

  const caps = capsFor(profile.biomarkers);

  const headroom = ledger.reduce<Headroom>(
    (remaining, row) => {
      const spent = footprintOf(profile, row);
      return {
        // A Target may be overshot, and Headroom on it goes negative to say so.
        macros: {
          protein: remaining.macros.protein - spent.protein,
          carbohydrate: remaining.macros.carbohydrate - spent.carbohydrate,
          fat: remaining.macros.fat - spent.fat,
        },
        // A Cap may not be spent past zero: once it is gone, the rest of the
        // day gets none of it, however much was overshot.
        caps: {
          saturatedFat: Math.max(
            0,
            remaining.caps.saturatedFat - spent.saturatedFat,
          ),
        },
      };
    },
    { macros: targets, caps },
  );

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
        : shareOf(headroom.macros, slot.share, remainingShare),
      caps: isSpent(slot)
        ? capShareOf(caps, slot.share, 100)
        : capShareOf(headroom.caps, slot.share, remainingShare),
    }));

  return { targets, headroom, directives };
};
