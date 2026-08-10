/**
 * The WHOOP-proposes / user-confirms day planner.
 *
 * Pure functions only: no database, no network, no clock. Everything the
 * planner needs is an argument, so its behaviour is fully testable and the
 * same inputs always produce the same proposal.
 *
 * Three DNA clauses are load-bearing here:
 *
 *   §4.11 Precision adapts to control. The planner reads controlLevel BEFORE
 *         deciding how precise to be. On a MINIMAL day it defends the protein
 *         floor and asks for one decision per meal; it does not emit
 *         gram-level targets it knows the user cannot act on. §4.11 calls that
 *         "precision theater" and names it a design failure.
 *
 *   §4.12 The system proposes, it never disposes on anything it doesn't own.
 *         Slot timing inside today's plan is ours to adjust freely. But the
 *         wake/train/sleep skeleton describes the user's actual day, so it is
 *         emitted as a proposal with a rationale and never pre-applied.
 *
 *   §8    Some things are the founder's call, not ours. The FAST_AGGRESSIVE
 *         guardrails are an explicit open question, so this planner refuses to
 *         invent them rather than guessing. See proposeDay's return.
 */

export type ControlLevel = "FULL" | "PARTIAL" | "MINIMAL" | "UNKNOWN";
export type GoalMode = "STRICT_HEALTHY" | "FAST_AGGRESSIVE";
export type Evidence = "MEASURED" | "PARTIAL" | "PROFILE_ONLY" | "NONE";

/** Minutes since local midnight. The planner's internal time unit. */
type Minutes = number;

export type WearableSignal = {
  /** WHOOP recovery 0-100, or null when unscored / not worn. */
  recoveryScore: number | null;
  /** When the user actually woke, from WHOOP sleep end. */
  wakeTime: string | null;
  sleepDurationMin: number | null;
  sleepPerformance: number | null;
  strain: number | null;
};

export type PlannerProfile = {
  typicalWakeTime: string | null;
  typicalSleepTime: string | null;
  mealsPerDay: number | null;
  proteinTargetG: number | null;
  proteinFloorG: number | null;
  carbTargetG: number | null;
  kcalTarget: number | null;
  controlLevel: ControlLevel;
  goalMode: GoalMode | null;
};

export type TrainingWindow = {
  start: string;
  end: string;
  type: string | null;
} | null;

/**
 * A meal the user has already logged today.
 *
 * `confidence` and `estimated` are carried through rather than flattened into
 * the macro figures, because they decide whether the resulting adjustment is
 * `MEASURED` or `ASSUMED` in the trace. A 1200 kcal restaurant dish estimated
 * from a photo moves the plan exactly as far as a weighed one does — the
 * difference is that the system must not claim to know it.
 */
export type ConsumedMeal = {
  /** Minutes since local midnight, or null when the log carries no time. */
  atMinutes: Minutes | null;
  proteinG: number | null;
  carbG: number | null;
  kcal: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  estimated: boolean;
};

/**
 * What is left of the day's commitment after logged intake.
 *
 * Separate from `DayTarget` on purpose. The target is the promise made this
 * morning; this is the promise minus reality. Showing one in place of the other
 * is how a tracker ends up telling someone they have 140g of protein to eat at
 * 21:00 with one slot left.
 *
 * `overBy` is not the negative of `remaining`: once a macro goes past its
 * figure, `remaining` clamps to 0 (there is nothing left to plan) while
 * `overBy` records by how much, so the UI can state the overage without the
 * planner trying to distribute a negative amount across slots.
 */
export type RemainingTargets = {
  proteinG: number | null;
  carbG: number | null;
  kcal: number | null;
  overBy: { proteinG: number; carbG: number; kcal: number };
  /** Sum of what was logged, for showing the subtraction rather than asserting it. */
  consumed: { proteinG: number; carbG: number; kcal: number };
  mealsLogged: number;
  /**
   * True when every logged figure was a low-confidence estimate. The remainder
   * is then arithmetic on guesses, and the UI must not present it as a budget.
   */
  allLowConfidence: boolean;
};

export type ProposedSlot = {
  slotTime: string;
  label: string;
  purpose: string;
  /** Null when precision would be theater — see §4.11. */
  targetProteinG: number | null;
  targetCarbG: number | null;
  targetKcal: number | null;
  /** The single highest-leverage decision for this slot on low-control days. */
  oneDecision: string | null;
  sortOrder: number;
  /**
   * This slot's time has passed, so it can no longer absorb any of the
   * remainder. Null when the caller passed no clock — absent knowledge of "now"
   * is not the same as knowing the slot is still ahead, and `false` would say
   * the latter.
   */
  isPast: boolean | null;
  /**
   * Set when the remainder was redistributed into this slot, describing the move
   * in the slot's own terms ("+18g protein on this morning's plan"). Null when
   * nothing was redistributed, so the UI shows a delta only where one exists.
   */
  adjustmentNote: string | null;
};

/**
 * The day's whole-day macro commitment, for comparing against what was logged.
 *
 * `proteinKind` is the load-bearing field. On a low-control day the planner
 * defends the protein *floor* instead of prescribing the target, and those are
 * different claims: clearing a 150g floor is a success, while falling 55g short
 * of a 205g target is not. A progress bar that showed one number without saying
 * which kind it was would be §4.11 exactly — an assumption wearing a
 * measurement's clothes.
 *
 * Carbs and kcal stay null on imprecise days rather than falling back to
 * something softer, because there is no honest "floor" for them here.
 */
export type DayTarget = {
  proteinG: number | null;
  proteinKind: "TARGET" | "FLOOR";
  carbG: number | null;
  kcal: number | null;
};

export type DayProposal = {
  wakeTime: string;
  sleepTime: string;
  trainingStart: string | null;
  trainingEnd: string | null;
  trainingType: string | null;
  slots: ProposedSlot[];
  /**
   * The day total. Deliberately not the sum of the slot targets: those are
   * per-slot rounded, so adding them back up drifts from the figure the planner
   * actually committed to.
   */
  dayTarget: DayTarget;
  /** Human-readable reasons, so the proposal can be argued with. */
  rationale: string[];
  evidence: Evidence;
  /**
   * The day's commitment minus what has actually been logged.
   *
   * Null when the caller passed no `consumed` list at all, which is different
   * from an empty one: no list means intake is unknown, an empty list means
   * nothing has been eaten yet. Collapsing those would show a full budget
   * remaining to someone whose log simply failed to load.
   */
  remaining: RemainingTargets | null;
  /**
   * Plain-language summary of how logged intake changed the rest of the day.
   * Empty when nothing was logged, so the UI can stay quiet rather than
   * announcing a replan that did not happen.
   */
  replanNotes: string[];
  /**
   * Ordered links from input to consequence, one per decision the planner made.
   * Empty is not possible in practice — control level always contributes one —
   * so an empty trace means the planner did not run.
   */
  trace: DecisionTraceEntry[];
  controlLevel: ControlLevel;
  /** Things the planner deliberately refused to decide. */
  deferrals: string[];
};

/* ------------------------------------------------------------------ time --- */

export function parseTime(hhmm: string): Minutes | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatTime(mins: Minutes): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Round to the nearest 15 minutes: a plan of 07:38 reads as false precision. */
function roundToQuarter(mins: Minutes): Minutes {
  return Math.round(mins / 15) * 15;
}

/**
 * Parse a possibly-absent time, falling back when it is missing OR unparseable.
 *
 * The `&&`/`??` shortcut this replaces had a real hole: an empty-string profile
 * field yields `""`, which `??` does not treat as absent, so a blank
 * typicalWakeTime would poison the arithmetic instead of falling back.
 */
function timeOr(value: string | null | undefined, fallback: Minutes): Minutes {
  if (!value) return fallback;
  const parsed = parseTime(value);
  return parsed === null ? fallback : parsed;
}

/* ----------------------------------------------------------------- trace --- */

/**
 * One link in the chain from a wearable reading to a change in the plan.
 *
 * This exists because `rationale` is prose: it reads well but cannot be checked.
 * A trace entry is structured, so a test can assert that a decision claiming to
 * rest on a recovery score actually had one — and so the UI can show the link
 * instead of asking the user to trust it.
 *
 * `basis` is the point of the whole type. `MEASURED` means a real reading drove
 * this; `ASSUMED` means a default filled a gap. Collapsing those two into one
 * confident sentence is the failure §4.11 names, and it is invisible in prose.
 */
export type DecisionTraceEntry = {
  input:
    | "WHOOP_WAKE"
    | "WHOOP_RECOVERY"
    | "WHOOP_STRAIN"
    | "LOGGED_INTAKE"
    | "PROFILE_CONTROL"
    | "PROFILE_TRAINING"
    | "PROFILE_GOAL";
  /** Short label for the input, for display. */
  label: string;
  /** The reading as shown, or null when there was nothing to read. */
  reading: string | null;
  /** What actually changed in the plan because of it. */
  effect: string;
  basis: "MEASURED" | "ASSUMED";
};

/**
 * WHOOP fields that are fetched and stored but drive no planning decision.
 *
 * Kept as data rather than a comment so the UI can state it outright. Every one
 * of these is on `wearable_daily` and on `WearableSignal`, and `proposeDay`
 * reads none of them — verified by `scripts/test-whoop-trace.ts`, which fails if
 * any becomes load-bearing without moving off this list.
 *
 * Surfacing this is the honest answer to "what does my WHOOP data do here?". A
 * panel that showed HRV beside the plan would imply it shaped it; it does not.
 * Sleep duration is the subtle case — it moves the evidence badge but changes no
 * time and no target, so it is listed with that exact caveat rather than as an
 * input.
 *
 * Strain used to head this list and has been removed because it now genuinely
 * moves the carb target (see the strain band below). Removing it was the whole
 * point of the exercise: the list is meant to shrink as signals become
 * load-bearing, not to sit here as permanent decoration.
 */
export const UNUSED_WEARABLE_SIGNALS: ReadonlyArray<{
  field: string;
  label: string;
  why: string;
}> = [
  {
    field: "hrvMs",
    label: "HRV",
    why: "Stored. It already feeds WHOOP's own recovery score, which is what this plan reads.",
  },
  {
    field: "restingHr",
    label: "Resting HR",
    why: "Stored, and likewise folded into recovery rather than read directly.",
  },
  {
    field: "sleepPerformance",
    label: "Sleep performance",
    why: "Stored, but bedtime moves on recovery, not on this percentage.",
  },
  {
    field: "kcalBurned",
    label: "Calories burned",
    why: "Stored. Spending it against intake needs a founder decision on deficit handling (DNA §8).",
  },
  {
    field: "sleepDurationMin",
    label: "Sleep duration",
    why: "Raises how much of this plan counts as measured, but shifts no time and no target.",
  },
];

/* -------------------------------------------------------------- evidence --- */

/**
 * How much of this proposal rests on measurement rather than assumption.
 *
 * This is not cosmetic. It is what lets the UI say "WHOOP measured you woke at
 * 06:40" versus "we assumed your usual 07:00", instead of presenting a guess
 * in the same voice as a fact.
 */
export function assessEvidence(signal: WearableSignal): Evidence {
  const hasWake = Boolean(signal.wakeTime);
  const hasRecovery = signal.recoveryScore !== null;
  const hasSleep = signal.sleepDurationMin !== null;

  if (hasWake && hasRecovery && hasSleep) return "MEASURED";
  if (hasWake || hasRecovery || hasSleep) return "PARTIAL";
  return "PROFILE_ONLY";
}

/* --------------------------------------------------------------- planner --- */

const DEFAULT_WAKE = "07:00";
const DEFAULT_SLEEP = "23:00";

/**
 * Meal count by control level.
 *
 * Fewer, larger anchors on low-control days: each additional slot is another
 * occasion to comply with, and §4.11 wants one high-leverage decision per
 * occasion rather than many precise ones.
 */
function slotCountFor(control: ControlLevel, requested: number | null): number {
  const asked = requested ?? 3;
  if (control === "MINIMAL") return Math.min(asked, 2);
  if (control === "PARTIAL") return Math.min(asked, 3);
  return Math.min(Math.max(asked, 3), 6);
}

/**
 * Should this slot carry gram-level targets?
 *
 * FULL control earns real numbers. Anything less gets a protein floor and a
 * single decision, because emitting "38g carbs" to someone eating whatever the
 * canteen serves is precision the system cannot honour. §4.11.
 */
function shouldEmitPreciseTargets(control: ControlLevel): boolean {
  return control === "FULL";
}

/**
 * WHOOP strain bands, on WHOOP's own 0–21 scale.
 *
 * Only the ends of the scale move anything. A rule that nudged carbs for every
 * one-point wobble in the middle would be noise dressed as responsiveness, and
 * the user would have no way to tell the two apart.
 */
const STRAIN_HIGH = 14;
const STRAIN_LOW = 8;
/** Proportional carb moves, kept modest because strain is not a measured need. */
const STRAIN_HIGH_CARB_UPLIFT = 0.15;
const STRAIN_LOW_CARB_REDUCTION = 0.1;

/** Sum a macro across logged meals, treating nulls as absent rather than zero. */
function sumMacro(meals: ConsumedMeal[], key: "proteinG" | "carbG" | "kcal"): number {
  return meals.reduce((n, m) => n + (m[key] ?? 0), 0);
}

/**
 * Subtract logged intake from the day's commitment.
 *
 * Clamps at zero and records the overage separately, so downstream slot maths
 * never has to divide a negative remainder across meals. A macro with no target
 * stays null: there is no remainder of a promise that was never made.
 */
function computeRemaining(
  dayTarget: DayTarget,
  meals: ConsumedMeal[],
): RemainingTargets {
  const consumed = {
    proteinG: Math.round(sumMacro(meals, "proteinG")),
    carbG: Math.round(sumMacro(meals, "carbG")),
    kcal: Math.round(sumMacro(meals, "kcal")),
  };

  const left = (target: number | null, eaten: number) =>
    target === null ? null : Math.max(0, Math.round(target - eaten));
  const over = (target: number | null, eaten: number) =>
    target === null ? 0 : Math.max(0, Math.round(eaten - target));

  return {
    proteinG: left(dayTarget.proteinG, consumed.proteinG),
    carbG: left(dayTarget.carbG, consumed.carbG),
    kcal: left(dayTarget.kcal, consumed.kcal),
    overBy: {
      proteinG: over(dayTarget.proteinG, consumed.proteinG),
      carbG: over(dayTarget.carbG, consumed.carbG),
      kcal: over(dayTarget.kcal, consumed.kcal),
    },
    consumed,
    mealsLogged: meals.length,
    // `every` on an empty array is true, so the meal count guards it: a day with
    // nothing logged is not a day of low-confidence guesses.
    allLowConfidence:
      meals.length > 0 && meals.every((m) => m.confidence === "LOW"),
  };
}

export function proposeDay(args: {
  signal: WearableSignal;
  profile: PlannerProfile;
  training: TrainingWindow;
  /**
   * Meals already logged today. Undefined means "not known" and produces a null
   * remainder; an empty array means "nothing eaten yet" and produces a full one.
   */
  consumed?: ConsumedMeal[] | null;
  /**
   * Minutes since local midnight, for deciding which slots can still absorb the
   * remainder. Stays an argument rather than a `Date.now()` call so this module
   * remains pure and the replan is testable at any hour.
   */
  nowMinutes?: Minutes | null;
}): DayProposal {
  const { signal, profile, training } = args;
  const consumed = args.consumed ?? null;
  const nowMinutes = args.nowMinutes ?? null;
  const rationale: string[] = [];
  const deferrals: string[] = [];
  const replanNotes: string[] = [];
  // Built alongside `rationale` at each decision point, from the same branch, so
  // the structured trace and the prose cannot drift apart.
  const trace: DecisionTraceEntry[] = [];
  const evidence = assessEvidence(signal);
  const control = profile.controlLevel;

  /* --- §8: refuse to invent FAST_AGGRESSIVE guardrails ------------------- */
  if (profile.goalMode === "FAST_AGGRESSIVE") {
    deferrals.push(
      "Fast & aggressive mode is set, but how far it may deviate from biomarker guidance is an open founder decision (DNA §8). Planning conservatively under strict-healthy rules until those guardrails exist.",
    );
  }

  /* --- wake: measured beats assumed ------------------------------------- */
  let wakeMins: Minutes;
  if (signal.wakeTime && parseTime(signal.wakeTime) !== null) {
    wakeMins = parseTime(signal.wakeTime) as Minutes;
    rationale.push(`WHOOP recorded you woke at ${formatTime(wakeMins)}.`);
    trace.push({
      input: "WHOOP_WAKE",
      label: "Wake time",
      reading: formatTime(wakeMins),
      effect: `First meal set to ${formatTime(roundToQuarter(wakeMins + 60))}, an hour after waking.`,
      basis: "MEASURED",
    });
  } else {
    wakeMins = timeOr(
      profile.typicalWakeTime,
      parseTime(DEFAULT_WAKE) as Minutes,
    );
    rationale.push(
      profile.typicalWakeTime
        ? `No wake time from WHOOP today, so this uses your usual ${formatTime(wakeMins)}.`
        /*
          The invitation is back, because the goal form now writes
          `typicalWakeTime`. It was removed for one release when the field had no
          write path anywhere in the app: the sentence was true of the engine and
          false of the product, which is the worst kind of copy this codebase can
          ship. Keep the consequence in front of the invitation — the user should
          know what the guess costs before being asked to fix it.
        */
        : `No wake data and no usual wake time on file, so this assumes ${formatTime(wakeMins)}, and every meal time below is offset from that guess. Set your usual wake time on the goal page and the day re-plans around it.`,
    );
    trace.push({
      input: "WHOOP_WAKE",
      label: "Wake time",
      reading: null,
      effect: profile.typicalWakeTime
        ? `Fell back to your usual ${formatTime(wakeMins)}, so meal times come from your profile rather than today.`
        : `No reading and none on file, so ${formatTime(wakeMins)} is a placeholder the whole schedule inherits.`,
      basis: "ASSUMED",
    });
  }

  /* --- sleep target: driven by recovery, but only when measured ---------- */
  let sleepMins: Minutes = timeOr(
    profile.typicalSleepTime,
    parseTime(DEFAULT_SLEEP) as Minutes,
  );

  if (signal.recoveryScore !== null && signal.recoveryScore < 34) {
    sleepMins -= 45;
    rationale.push(
      `Recovery is ${signal.recoveryScore}%, so bedtime moves 45 minutes earlier.`,
    );
    trace.push({
      input: "WHOOP_RECOVERY",
      label: "Recovery",
      reading: `${signal.recoveryScore}%`,
      effect: `Below 34%, so bedtime moved 45 minutes earlier to ${formatTime(sleepMins)} — which also pulls the last meal earlier.`,
      basis: "MEASURED",
    });
  } else if (signal.recoveryScore !== null && signal.recoveryScore >= 67) {
    rationale.push(
      `Recovery is ${signal.recoveryScore}%, so your usual bedtime holds.`,
    );
    trace.push({
      input: "WHOOP_RECOVERY",
      label: "Recovery",
      reading: `${signal.recoveryScore}%`,
      effect: `67% or above, so your usual ${formatTime(sleepMins)} bedtime holds unchanged.`,
      basis: "MEASURED",
    });
  } else if (signal.recoveryScore === null) {
    rationale.push(
      "No recovery score today, so bedtime is your usual rather than an inferred one.",
    );
    trace.push({
      input: "WHOOP_RECOVERY",
      label: "Recovery",
      reading: null,
      effect: `Nothing to read, so bedtime stays at your usual ${formatTime(sleepMins)} rather than being inferred.`,
      basis: "ASSUMED",
    });
  } else {
    /*
     * The 34–66 middle band. It previously produced no rationale line at all,
     * which made a measured score look like a missing one: the panel showed
     * recovery driving nothing, when in fact it was read and deliberately left
     * the day alone. An unexplained absence is indistinguishable from an
     * oversight, so the band now states itself.
     */
    trace.push({
      input: "WHOOP_RECOVERY",
      label: "Recovery",
      reading: `${signal.recoveryScore}%`,
      effect: `In the middle band (34–66%), which neither pulls bedtime earlier nor confirms your usual one, so ${formatTime(sleepMins)} stands.`,
      basis: "MEASURED",
    });
  }

  /* --- strain: the day's actual output moves carbohydrate ---------------- */
  /*
   * Strain is the first WHOOP signal beyond recovery and wake to genuinely
   * change a number, so it comes off UNUSED_WEARABLE_SIGNALS above.
   *
   * It only moves carbs, and only when there is a carb target to move: on a
   * low-control day the planner emits no carb figure at all, and inventing one
   * here purely because strain was high would be §4.11 precision theater — a
   * gram target the day cannot honour, justified by a signal the user never
   * asked to be measured against.
   */
  let carbTargetG = profile.carbTargetG;
  if (signal.strain !== null && profile.carbTargetG !== null) {
    if (signal.strain >= STRAIN_HIGH) {
      carbTargetG = Math.round(profile.carbTargetG * (1 + STRAIN_HIGH_CARB_UPLIFT));
      rationale.push(
        `Strain is ${signal.strain.toFixed(1)}, so carbohydrate rises from ${profile.carbTargetG}g to ${carbTargetG}g.`,
      );
      trace.push({
        input: "WHOOP_STRAIN",
        label: "Day strain",
        reading: signal.strain.toFixed(1),
        effect: `${STRAIN_HIGH} or above, so the carb target rose ${Math.round(STRAIN_HIGH_CARB_UPLIFT * 100)}% to ${carbTargetG}g to cover the extra output.`,
        basis: "MEASURED",
      });
    } else if (signal.strain < STRAIN_LOW) {
      carbTargetG = Math.round(profile.carbTargetG * (1 - STRAIN_LOW_CARB_REDUCTION));
      rationale.push(
        `Strain is only ${signal.strain.toFixed(1)}, so carbohydrate eases from ${profile.carbTargetG}g to ${carbTargetG}g.`,
      );
      trace.push({
        input: "WHOOP_STRAIN",
        label: "Day strain",
        reading: signal.strain.toFixed(1),
        effect: `Below ${STRAIN_LOW}, so the carb target eased ${Math.round(STRAIN_LOW_CARB_REDUCTION * 100)}% to ${carbTargetG}g.`,
        basis: "MEASURED",
      });
    } else {
      // Same reasoning as the recovery middle band: a signal that was read and
      // deliberately changed nothing must say so, or it is indistinguishable
      // from a signal that was never read.
      trace.push({
        input: "WHOOP_STRAIN",
        label: "Day strain",
        reading: signal.strain.toFixed(1),
        effect: `Between ${STRAIN_LOW} and ${STRAIN_HIGH}, an ordinary day, so the carb target stays at ${profile.carbTargetG}g.`,
        basis: "MEASURED",
      });
    }
  } else if (signal.strain !== null) {
    trace.push({
      input: "WHOOP_STRAIN",
      label: "Day strain",
      reading: signal.strain.toFixed(1),
      effect:
        "Read, but this day carries no gram-level carb target for it to move, so it changed nothing.",
      basis: "MEASURED",
    });
  }

  /* --- meal slots ------------------------------------------------------- */
  const count = slotCountFor(control, profile.mealsPerDay);
  const precise = shouldEmitPreciseTargets(control);

  if (!precise) {
    rationale.push(
      control === "UNKNOWN"
        ? "We do not know how much control you have over food today, so this plan protects protein and leaves the rest open."
        : `Your control over food today is ${control.toLowerCase()}, so this plan defends your protein floor instead of prescribing exact macros.`,
    );
  }

  /*
   * Control level is listed as ASSUMED when UNKNOWN and MEASURED otherwise,
   * because it is self-reported at onboarding rather than sensed. Calling a
   * stated answer "measured" would stretch the word, but it is a real answer
   * from the user, so it is not an assumption either — UNKNOWN is the only case
   * where the system is genuinely filling a gap on its own.
   */
  trace.push({
    input: "PROFILE_CONTROL",
    label: "Food control",
    reading: control === "UNKNOWN" ? null : control.toLowerCase(),
    effect: precise
      ? `Full control, so slots carry gram-level protein, carb and calorie targets across ${count} meals.`
      : `${count} meal${count === 1 ? "" : "s"} with a protein floor and one decision each, instead of gram targets this day cannot honour.`,
    basis: control === "UNKNOWN" ? "ASSUMED" : "MEASURED",
  });

  const trainStart = training?.start ? parseTime(training.start) : null;
  const trainEnd = training?.end ? parseTime(training.end) : null;

  const firstMeal = roundToQuarter(wakeMins + 60);
  const lastMeal = roundToQuarter(sleepMins - 150);
  const span = Math.max(lastMeal - firstMeal, 60);
  const gap = count > 1 ? span / (count - 1) : 0;

  const proteinTotal = precise
    ? profile.proteinTargetG
    : (profile.proteinFloorG ?? profile.proteinTargetG);
  const perSlotProtein = proteinTotal ? Math.round(proteinTotal / count) : null;

  const slots: ProposedSlot[] = [];
  for (let i = 0; i < count; i++) {
    const raw = count === 1 ? firstMeal : firstMeal + gap * i;
    const at = roundToQuarter(raw);

    let label = i === 0 ? "First meal" : i === count - 1 ? "Last meal" : `Meal ${i + 1}`;
    let purpose = "Steady protein through the day.";

    // Training is the one thing that genuinely reorders eating.
    if (trainStart !== null && trainEnd !== null) {
      if (at > trainStart - 90 && at <= trainStart) {
        label = "Pre-training";
        purpose = "Carbs in early enough to fuel the session, light enough to sit well.";
      } else if (at >= trainEnd && at < trainEnd + 120) {
        label = "Post-training";
        purpose = "Protein plus carbs while the session's demand is still open.";
      }
    }

    slots.push({
      slotTime: formatTime(at),
      label,
      purpose,
      targetProteinG: perSlotProtein,
      targetCarbG:
        precise && carbTargetG ? Math.round(carbTargetG / count) : null,
      targetKcal:
        precise && profile.kcalTarget
          ? Math.round(profile.kcalTarget / count)
          : null,
      oneDecision: precise
        ? null
        : label === "Post-training"
          ? "Make this one protein-led."
          : "Add one palm-sized protein to whatever you eat.",
      sortOrder: i,
      isPast: nowMinutes === null ? null : at <= nowMinutes,
      adjustmentNote: null,
    });
  }

  if (trainStart !== null) {
    rationale.push(
      `Meals are arranged around your ${training?.type ?? "training"} at ${training?.start}.`,
    );
    const relabelled = slots.filter(
      (s) => s.label === "Pre-training" || s.label === "Post-training",
    ).length;
    trace.push({
      input: "PROFILE_TRAINING",
      label: "Training window",
      reading: `${training?.type ?? "training"} at ${training?.start}`,
      effect:
        relabelled > 0
          ? `${relabelled} slot${relabelled === 1 ? "" : "s"} repurposed around the session — carbs before, protein and carbs after.`
          : "Session noted, though no meal slot falls close enough to it to be repurposed.",
      basis: "MEASURED",
    });
  }

  /* --- §4.12: this is a proposal about the user's own day ---------------- */
  deferrals.push(
    "Wake, training and sleep times describe your day, not ours, so nothing here is applied until you confirm it.",
  );

  /* --- replan against what has actually been eaten ---------------------- */
  const dayTarget: DayTarget = {
      // proteinTotal is already the target-or-floor decision made above; reusing
      // it keeps one source of truth rather than re-deriving the same rule.
      proteinG: proteinTotal ?? null,
      // Not simply `precise ? TARGET : FLOOR`. On an imprecise day the figure
      // falls back to the target when no floor is set, and calling that a floor
      // would mislabel the very number the label exists to qualify.
      proteinKind:
        !precise && profile.proteinFloorG !== null && profile.proteinFloorG !== undefined
          ? "FLOOR"
          : "TARGET",
    carbG: precise ? (carbTargetG ?? null) : null,
    kcal: precise ? (profile.kcalTarget ?? null) : null,
  };

  const remaining = consumed === null ? null : computeRemaining(dayTarget, consumed);

  if (remaining !== null && remaining.mealsLogged > 0) {
    /*
     * Redistribute what is left across the slots that can still absorb it.
     *
     * Only slots still ahead of `nowMinutes` qualify. Spreading the remainder
     * over a breakfast that happened four hours ago produces a plan that adds up
     * on paper and cannot be followed, which is the precise failure this whole
     * change exists to remove. With no clock supplied, every slot is treated as
     * available — an unknown hour must not silently delete the afternoon.
     */
    const absorbing = slots.filter((s) => s.isPast !== true);

    if (absorbing.length > 0) {
      const share = (total: number | null) =>
        total === null ? null : Math.round(total / absorbing.length);

      const perProtein = share(remaining.proteinG);
      const perCarb = precise ? share(remaining.carbG) : null;
      const perKcal = precise ? share(remaining.kcal) : null;

      for (const slot of absorbing) {
        const before = slot.targetProteinG;
        if (perProtein !== null) slot.targetProteinG = perProtein;
        if (perCarb !== null) slot.targetCarbG = perCarb;
        if (perKcal !== null) slot.targetKcal = perKcal;

        if (before !== null && perProtein !== null && perProtein !== before) {
          const delta = perProtein - before;
          slot.adjustmentNote = `${delta > 0 ? "+" : ""}${delta}g protein vs this morning's ${before}g.`;
        }
      }

      replanNotes.push(
        `${remaining.mealsLogged} meal${remaining.mealsLogged === 1 ? "" : "s"} logged so far: ${remaining.consumed.proteinG}g protein. The rest of the day is spread across your remaining ${absorbing.length} slot${absorbing.length === 1 ? "" : "s"}.`,
      );
    } else {
      /*
       * Every slot has passed. The remainder is real but there is nowhere left to
       * put it, and quietly showing the morning's untouched per-slot numbers
       * would imply a plan that no longer exists.
       */
      replanNotes.push(
        remaining.proteinG === null || remaining.proteinG === 0
          ? "Every planned meal time has passed. Nothing further is planned for today."
          : `Every planned meal time has passed with ${remaining.proteinG}g protein still short of the day's ${dayTarget.proteinKind === "FLOOR" ? "floor" : "target"}. Tomorrow's plan starts fresh; this is not carried over.`,
      );
    }

    // Overshoot is stated, never absorbed silently. Being over is information the
    // user is entitled to, and hiding it inside a clamped remainder of zero would
    // present a breached target as a met one.
    if (remaining.overBy.kcal > 0) {
      replanNotes.push(
        `Logged intake is ${remaining.overBy.kcal} kcal past today's figure. Later slots are trimmed to what is left rather than rebalanced to hide it.`,
      );
    }

    /*
     * Confidence decides the basis, not the size of the adjustment. A photo
     * estimate moves the plan exactly as far as a weighed meal does — the
     * difference is only ever in what the system claims to know, which is the
     * distinction the trace exists to carry.
     */
    trace.push({
      input: "LOGGED_INTAKE",
      label: "Logged meals",
      reading: `${remaining.mealsLogged} meal${remaining.mealsLogged === 1 ? "" : "s"}, ${remaining.consumed.proteinG}g protein${remaining.consumed.kcal > 0 ? `, ${remaining.consumed.kcal} kcal` : ""}`,
      effect:
        absorbing.length > 0
          ? `Subtracted from the day, leaving ${remaining.proteinG ?? 0}g protein across ${absorbing.length} remaining slot${absorbing.length === 1 ? "" : "s"}.`
          : "Subtracted from the day, but every planned slot has passed so nothing was redistributed.",
      basis: remaining.allLowConfidence ? "ASSUMED" : "MEASURED",
    });

    if (remaining.allLowConfidence) {
      replanNotes.push(
        "Every meal logged today was a low-confidence estimate, so this remainder is arithmetic on guesses rather than a budget.",
      );
    }
  }

  return {
    wakeTime: formatTime(wakeMins),
    sleepTime: formatTime(sleepMins),
    trainingStart: training?.start ?? null,
    trainingEnd: training?.end ?? null,
    trainingType: training?.type ?? null,
    slots,
    dayTarget,
    remaining,
    replanNotes,
    rationale,
    evidence,
    controlLevel: control,
    deferrals,
    trace,
  };
}
