// The only "engine" the demo is allowed to have (DEMO_SPEC.md §3). A pure
// function: events in, UI state out. No planning/diagnosis logic ported from
// the real Health Engine — the rules below are the reducer rules the spec
// enumerates, nothing more.

import type {
  DemoEvent,
  Targets,
  Macros,
  Confidence,
  FoodLoggedEvent,
  TargetsRevisedEvent,
  DaySummary,
} from "./events";

export type MealDiagnosis =
  | "on_track"
  | "over_by_choice"
  | "over_by_revision"
  | "uncertain";

export type LoggedMeal = {
  event: FoodLoggedEvent;
  index: number;
  diagnosis: MealDiagnosis;
  targetsAtLogTime: Targets;
};

export type DemoState = {
  targets: Targets;
  targetsVersion: number;
  targetHistory: Targets[];
  consumed: Macros;
  remaining: Macros;
  loggedMeals: LoggedMeal[];
  revisions: Array<{ event: TargetsRevisedEvent; index: number }>;
  dayDiagnosis: MealDiagnosis;
  daySummary: DaySummary | null;
};

const ZERO_MACROS: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function sumMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

function floorAtZero(n: number): number {
  return n < 0 ? 0 : n;
}

function remainingOf(targets: Targets, consumed: Macros): Macros {
  return {
    kcal: floorAtZero(targets.kcal - consumed.kcal),
    protein_g: floorAtZero(targets.protein_g - consumed.protein_g),
    carbs_g: floorAtZero(targets.carbs_g - consumed.carbs_g),
    fat_g: floorAtZero(targets.fat_max_g - consumed.fat_g),
  };
}

/** A meal is judged only against the targets version live when it was
 *  eaten — never re-scored after a later revision. Low/medium confidence
 *  estimates are honest uncertainty, not a number to grade. */
function diagnoseMeal(
  cumulativeConsumedThroughMeal: Macros,
  targetsAtLogTime: Targets,
  confidence: Confidence,
): MealDiagnosis {
  if (confidence !== "HIGH") return "uncertain";
  return cumulativeConsumedThroughMeal.kcal > targetsAtLogTime.kcal
    ? "over_by_choice"
    : "on_track";
}

function diagnoseDay(
  loggedMeals: LoggedMeal[],
  currentTargets: Targets,
  consumed: Macros,
  hadLoweringRevisionAfterOverage: boolean,
): MealDiagnosis {
  if (loggedMeals.some((m) => m.diagnosis === "uncertain")) return "uncertain";
  if (consumed.kcal <= currentTargets.kcal) return "on_track";
  return hadLoweringRevisionAfterOverage ? "over_by_revision" : "over_by_choice";
}

export function reduce(events: DemoEvent[]): DemoState {
  let targets: Targets | null = null;
  const targetHistory: Targets[] = [];
  let consumed: Macros = ZERO_MACROS;
  const loggedMeals: LoggedMeal[] = [];
  const revisions: Array<{ event: TargetsRevisedEvent; index: number }> = [];
  let daySummary: DaySummary | null = null;
  let hadLoweringRevisionAfterOverage = false;

  events.forEach((event, index) => {
    switch (event.t) {
      case "SESSION_OPENED": {
        targets = event.targets;
        targetHistory.push(targets);
        break;
      }
      case "FOOD_LOGGED": {
        if (!targets) break; // no session yet — nothing to score against
        const targetsAtLogTime = targetHistory[event.snapshotVersion] ?? targets;
        consumed = sumMacros(consumed, event.macros);
        const diagnosis = diagnoseMeal(consumed, targetsAtLogTime, event.confidence);
        loggedMeals.push({ event, index, diagnosis, targetsAtLogTime });
        break;
      }
      case "TRAINING_CHANGED": {
        break; // recorded via the TARGETS_REVISED it triggers; nothing to accumulate here
      }
      case "TARGETS_REVISED": {
        if (targets && event.targets.kcal < targets.kcal && consumed.kcal > event.targets.kcal) {
          hadLoweringRevisionAfterOverage = true;
        }
        targets = event.targets;
        targetHistory.push(targets);
        revisions.push({ event, index });
        break;
      }
      case "DAY_CLOSED": {
        daySummary = event.summary;
        break;
      }
    }
  });

  const finalTargets: Targets =
    targets ?? {
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_max_g: 0,
      provenance: {},
    };

  return {
    targets: finalTargets,
    targetsVersion: targetHistory.length - 1,
    targetHistory,
    consumed,
    remaining: remainingOf(finalTargets, consumed),
    loggedMeals,
    revisions,
    dayDiagnosis: diagnoseDay(loggedMeals, finalTargets, consumed, hadLoweringRevisionAfterOverage),
    daySummary,
  };
}
