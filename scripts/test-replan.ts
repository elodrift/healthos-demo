/**
 * The adaptive plan (C1) and strain as a load-bearing input (C2).
 *
 * What these lock in:
 *
 *  1. Logged meals actually change the rest of the day. Before this, `proposeDay`
 *     took no intake at all and the subtraction happened in one progress bar, so
 *     the plan a user followed at 20:00 was still the one written at 07:00.
 *  2. Only slots still ahead absorb the remainder. Spreading it over a breakfast
 *     that already happened produces a plan that adds up and cannot be followed.
 *  3. Strain moves the carb target, and is reported as MEASURED when it does.
 *     This is the inverse of the UNUSED_WEARABLE_SIGNALS guard in
 *     test-whoop-trace.ts: that test proves listed fields change nothing, and it
 *     goes quiet the moment a field is removed from the list. Without the
 *     assertions below, strain could silently stop working and every test would
 *     still pass.
 *  4. Confidence changes the *basis*, never the size of the adjustment. A photo
 *     estimate must move the plan as far as a weighed meal does, while still
 *     being labelled as a guess.
 */

import {
  proposeDay,
  UNUSED_WEARABLE_SIGNALS,
  type ConsumedMeal,
  type PlannerProfile,
  type WearableSignal,
} from "../lib/planner/propose-day";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

const BLANK: WearableSignal = {
  wakeTime: "07:00",
  recoveryScore: 60,
  sleepDurationMin: 450,
  sleepPerformance: 85,
  strain: null,
};

const PROFILE: PlannerProfile = {
  controlLevel: "FULL",
  goalMode: "STRICT_HEALTHY",
  mealsPerDay: 3,
  typicalWakeTime: "07:00",
  typicalSleepTime: "23:00",
  proteinTargetG: 165,
  proteinFloorG: 120,
  carbTargetG: 240,
  kcalTarget: 2400,
};

const meal = (over: Partial<ConsumedMeal> = {}): ConsumedMeal => ({
  atMinutes: 8 * 60,
  proteinG: 30,
  carbG: 60,
  kcal: 500,
  confidence: "MEDIUM",
  estimated: true,
  ...over,
});

console.log("\nadaptive replan\n");

/* --- 1. absent intake is not the same as no intake ----------------------- */
{
  const unknown = proposeDay({ signal: BLANK, profile: PROFILE, training: null });
  check("no consumed list leaves remaining null", unknown.remaining === null);
  check("no consumed list stays silent", unknown.replanNotes.length === 0);

  const empty = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [],
  });
  check("empty list produces a real remainder", empty.remaining !== null);
  check(
    "empty list leaves the full target outstanding",
    empty.remaining?.proteinG === 165,
    String(empty.remaining?.proteinG),
  );
  // An empty day must not be described as a day of guesses.
  check("empty list is not flagged low-confidence", empty.remaining?.allLowConfidence === false);
}

/* --- 2. logged intake is subtracted ------------------------------------- */
{
  const p = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [meal(), meal()],
    nowMinutes: 9 * 60,
  });

  check("consumed protein is summed", p.remaining?.consumed.proteinG === 60);
  check(
    "remainder is target minus intake",
    p.remaining?.proteinG === 105,
    String(p.remaining?.proteinG),
  );
  check("replan is announced", p.replanNotes.length > 0);

  const t = p.trace.find((x) => x.input === "LOGGED_INTAKE");
  check("intake appears in the trace", t !== undefined);
  check("medium-confidence intake is MEASURED", t?.basis === "MEASURED", t?.basis);
}

/* --- 3. only slots still ahead absorb the remainder ---------------------- */
{
  const early = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [meal()],
    nowMinutes: 8 * 60,
  });
  const late = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [meal()],
    nowMinutes: 21 * 60,
  });

  const futureEarly = early.slots.filter((s) => s.isPast === false).length;
  const futureLate = late.slots.filter((s) => s.isPast === false).length;
  check(
    "fewer slots remain later in the day",
    futureLate < futureEarly,
    `${futureLate} vs ${futureEarly}`,
  );

  // The remainder per slot must rise as slots run out, or the plan is quietly
  // dropping the difference.
  const earlyShare = early.slots.find((s) => s.isPast === false)?.targetProteinG ?? 0;
  const lateShare = late.slots.find((s) => s.isPast === false)?.targetProteinG ?? 0;
  if (futureLate > 0) {
    check("remaining slots carry more each", lateShare > earlyShare, `${lateShare} vs ${earlyShare}`);
  }

  const past = early.slots.filter((s) => s.isPast === true);
  check("past slots are marked", past.length > 0);
  check(
    "past slots carry no adjustment",
    past.every((s) => s.adjustmentNote === null),
  );

  // With no clock at all, nothing may be assumed to have passed.
  const noClock = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [meal()],
  });
  check(
    "absent clock leaves isPast null, not false",
    noClock.slots.every((s) => s.isPast === null),
  );
}

/* --- 4. a large overshoot is stated, not hidden -------------------------- */
{
  const p = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    // The brief's own case: one restaurant dish that eats the whole day.
    consumed: [meal({ proteinG: 60, carbG: 150, kcal: 3000 })],
    nowMinutes: 13 * 60,
  });

  check("kcal overage is recorded", (p.remaining?.overBy.kcal ?? 0) > 0);
  check(
    "remainder clamps at zero rather than going negative",
    p.remaining?.kcal === 0,
    String(p.remaining?.kcal),
  );
  check(
    "the overage is said out loud",
    p.replanNotes.some((n) => /past today's figure/.test(n)),
    p.replanNotes.join(" | "),
  );
  check(
    "no slot is given a negative target",
    p.slots.every((s) => (s.targetKcal ?? 0) >= 0),
  );
}

/* --- 5. confidence changes the basis, not the arithmetic ----------------- */
{
  const low = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [meal({ confidence: "LOW" })],
    nowMinutes: 9 * 60,
  });
  const high = proposeDay({
    signal: BLANK,
    profile: PROFILE,
    training: null,
    consumed: [meal({ confidence: "HIGH" })],
    nowMinutes: 9 * 60,
  });

  check(
    "a guess moves the plan exactly as far as a measurement",
    low.remaining?.proteinG === high.remaining?.proteinG,
    `${low.remaining?.proteinG} vs ${high.remaining?.proteinG}`,
  );
  check(
    "all-low-confidence intake is ASSUMED",
    low.trace.find((t) => t.input === "LOGGED_INTAKE")?.basis === "ASSUMED",
  );
  check(
    "high-confidence intake is MEASURED",
    high.trace.find((t) => t.input === "LOGGED_INTAKE")?.basis === "MEASURED",
  );
  check("low confidence is disclosed to the reader", low.remaining?.allLowConfidence === true);
}

console.log("\nstrain is load-bearing\n");

/* --- 6. strain moves carbs in both directions --------------------------- */
{
  const base = proposeDay({ signal: BLANK, profile: PROFILE, training: null });
  const hard = proposeDay({
    signal: { ...BLANK, strain: 17.2 },
    profile: PROFILE,
    training: null,
  });
  const easy = proposeDay({
    signal: { ...BLANK, strain: 4.1 },
    profile: PROFILE,
    training: null,
  });

  check(
    "high strain raises the carb target",
    (hard.dayTarget.carbG ?? 0) > (base.dayTarget.carbG ?? 0),
    `${hard.dayTarget.carbG} vs ${base.dayTarget.carbG}`,
  );
  check(
    "low strain lowers the carb target",
    (easy.dayTarget.carbG ?? 0) < (base.dayTarget.carbG ?? 0),
    `${easy.dayTarget.carbG} vs ${base.dayTarget.carbG}`,
  );
  check(
    "high strain is traced as MEASURED",
    hard.trace.find((t) => t.input === "WHOOP_STRAIN")?.basis === "MEASURED",
  );
  check(
    "the strain decision is explained in the rationale",
    hard.rationale.some((r) => /[Ss]train/.test(r)),
    hard.rationale.join(" | "),
  );

  // A signal read and deliberately ignored must say so, or it is
  // indistinguishable from one that was never read.
  const mid = proposeDay({
    signal: { ...BLANK, strain: 11 },
    profile: PROFILE,
    training: null,
  });
  const midTrace = mid.trace.find((t) => t.input === "WHOOP_STRAIN");
  check("mid-band strain still appears in the trace", midTrace !== undefined);
  check(
    "mid-band strain reports no change",
    /stays at/.test(midTrace?.effect ?? ""),
    midTrace?.effect,
  );
  check(
    "mid-band strain leaves the target untouched",
    mid.dayTarget.carbG === base.dayTarget.carbG,
  );

  // Absent strain must not be read as an easy day.
  check(
    "absent strain emits no strain trace",
    base.trace.find((t) => t.input === "WHOOP_STRAIN") === undefined,
  );
}

/* --- 7. strain must no longer claim to be unused ------------------------ */
{
  check(
    "strain is gone from UNUSED_WEARABLE_SIGNALS",
    !UNUSED_WEARABLE_SIGNALS.some((s) => s.field === "strain"),
    UNUSED_WEARABLE_SIGNALS.map((s) => s.field).join(", "),
  );
  // The list must not empty out silently either; the remaining fields really are
  // unused and the claim has to keep being made.
  check("the honesty list still names real fields", UNUSED_WEARABLE_SIGNALS.length > 0);
}

/* --- 8. no gram targets invented on a low-control day ------------------- */
{
  const minimal = proposeDay({
    signal: { ...BLANK, strain: 18 },
    profile: { ...PROFILE, controlLevel: "MINIMAL", carbTargetG: null },
    training: null,
    consumed: [meal()],
    nowMinutes: 9 * 60,
  });

  check(
    "high strain invents no carb figure without one to move",
    minimal.dayTarget.carbG === null,
    String(minimal.dayTarget.carbG),
  );
  check(
    "no per-slot carb targets appear",
    minimal.slots.every((s) => s.targetCarbG === null),
  );
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
