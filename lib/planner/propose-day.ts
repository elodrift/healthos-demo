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

export function proposeDay(args: {
  signal: WearableSignal;
  profile: PlannerProfile;
  training: TrainingWindow;
}): DayProposal {
  const { signal, profile, training } = args;
  const rationale: string[] = [];
  const deferrals: string[] = [];
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
  } else {
    wakeMins = timeOr(
      profile.typicalWakeTime,
      parseTime(DEFAULT_WAKE) as Minutes,
    );
    rationale.push(
      profile.typicalWakeTime
        ? `No wake time from WHOOP today, so this uses your usual ${formatTime(wakeMins)}.`
        : `No wake data and no usual wake time on file, so this assumes ${formatTime(wakeMins)}. Correct it and the day re-plans.`,
    );
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
  } else if (signal.recoveryScore !== null && signal.recoveryScore >= 67) {
    rationale.push(
      `Recovery is ${signal.recoveryScore}%, so your usual bedtime holds.`,
    );
  } else if (signal.recoveryScore === null) {
    rationale.push(
      "No recovery score today, so bedtime is your usual rather than an inferred one.",
    );
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
        precise && profile.carbTargetG
          ? Math.round(profile.carbTargetG / count)
          : null,
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
    });
  }

  if (trainStart !== null) {
    rationale.push(
      `Meals are arranged around your ${training?.type ?? "training"} at ${training?.start}.`,
    );
  }

  /* --- §4.12: this is a proposal about the user's own day ---------------- */
  deferrals.push(
    "Wake, training and sleep times describe your day, not ours, so nothing here is applied until you confirm it.",
  );

  return {
    wakeTime: formatTime(wakeMins),
    sleepTime: formatTime(sleepMins),
    trainingStart: training?.start ?? null,
    trainingEnd: training?.end ?? null,
    trainingType: training?.type ?? null,
    slots,
    dayTarget: {
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
      carbG: precise ? (profile.carbTargetG ?? null) : null,
      kcal: precise ? (profile.kcalTarget ?? null) : null,
    },
    rationale,
    evidence,
    controlLevel: control,
    deferrals,
  };
}
