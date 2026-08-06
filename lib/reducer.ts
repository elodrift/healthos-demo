// The only "engine" the demo has. A pure function: events in, UI state out.
// Rules (hard requirement from the brief):
//  - current targets = latest TARGETS_REVISED else SESSION_OPENED
//  - each FOOD_LOGGED is scored against the snapshot version it carries, forever
//  - remaining floors at zero
//  - diagnosis is one of on_track | over_by_choice | over_by_revision | uncertain,
//    always carrying its cause
// No other state logic anywhere in the app.

import type {
  DemoEvent,
  Targets,
  Macros,
  DaySummary,
  DiagnosisCode,
  FoodLoggedEvent,
  TargetsRevisedEvent,
} from "./events";

export type LoggedMeal = {
  event: FoodLoggedEvent;
  /** index into the event array — used for cross-highlighting */
  index: number;
  diagnosis: DiagnosisCode;
  /** the frozen targets snapshot this meal was judged against */
  targetsAtLogTime: Targets;
  targetsVersionAtLogTime: number;
};

export type DemoState = {
  targets: Targets;
  targetsVersion: number;
  targetHistory: Targets[];
  consumed: Macros;
  remaining: Macros;
  /** the part of `consumed` that came in below HIGH confidence — rendered hatched */
  estimated: Macros;
  loggedMeals: LoggedMeal[];
  revisions: Array<{ event: TargetsRevisedEvent; index: number }>;
  plannedVariances: string[];
  acceptedProposals: string[];
  diagnosis: { code: DiagnosisCode; causeChain: string[] } | null;
  daySummary: DaySummary | null;
  closed: boolean;
};

const ZERO_MACROS: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

const EMPTY_TARGETS: Targets = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_max_g: 0,
  provenance: {},
};

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

/** A meal is judged only against the targets version live when it was eaten —
 *  never re-scored after a later revision. Estimates are honest uncertainty,
 *  not a number to grade. */
function diagnoseMeal(
  cumulativeThroughMeal: Macros,
  targetsAtLogTime: Targets,
  event: FoodLoggedEvent,
): DiagnosisCode {
  if (event.confidence !== "HIGH") return "uncertain";
  return cumulativeThroughMeal.kcal > targetsAtLogTime.kcal
    ? "over_by_choice"
    : "on_track";
}

export function reduce(events: DemoEvent[]): DemoState {
  let targets: Targets | null = null;
  const targetHistory: Targets[] = [];
  let consumed: Macros = ZERO_MACROS;
  let estimated: Macros = ZERO_MACROS;
  const loggedMeals: LoggedMeal[] = [];
  const revisions: Array<{ event: TargetsRevisedEvent; index: number }> = [];
  const plannedVariances: string[] = [];
  const acceptedProposals: string[] = [];
  let diagnosis: DemoState["diagnosis"] = null;
  let daySummary: DaySummary | null = null;
  let closed = false;

  events.forEach((event, index) => {
    switch (event.t) {
      case "SESSION_OPENED": {
        targets = event.targets;
        targetHistory.push(event.targets);
        break;
      }
      case "FOOD_LOGGED": {
        if (!targets) break; // no session yet — nothing to score against
        const targetsAtLogTime = targetHistory[event.snapshotVersion] ?? targets;
        consumed = sumMacros(consumed, event.macros);
        if (event.confidence !== "HIGH") {
          estimated = sumMacros(estimated, event.macros);
        }
        loggedMeals.push({
          event,
          index,
          diagnosis: diagnoseMeal(consumed, targetsAtLogTime, event),
          targetsAtLogTime,
          targetsVersionAtLogTime: event.snapshotVersion,
        });
        break;
      }
      case "TRAINING_CHANGED": {
        // recorded for the feed; its consequence arrives as TARGETS_REVISED
        break;
      }
      case "TARGETS_REVISED": {
        targets = event.targets;
        targetHistory.push(event.targets);
        revisions.push({ event, index });
        break;
      }
      case "VARIANCE_PLANNED": {
        plannedVariances.push(event.label);
        break;
      }
      case "PROPOSAL_ACCEPTED": {
        acceptedProposals.push(event.label);
        break;
      }
      case "DIAGNOSIS": {
        diagnosis = { code: event.code, causeChain: event.causeChain };
        break;
      }
      case "DAY_CLOSED": {
        daySummary = event.summary;
        closed = true;
        break;
      }
    }
  });

  const finalTargets: Targets = targets ?? EMPTY_TARGETS;

  return {
    targets: finalTargets,
    targetsVersion: Math.max(0, targetHistory.length - 1),
    targetHistory,
    consumed,
    remaining: remainingOf(finalTargets, consumed),
    estimated,
    loggedMeals,
    revisions,
    plannedVariances,
    acceptedProposals,
    diagnosis,
    daySummary,
    closed,
  };
}
