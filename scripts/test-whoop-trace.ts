/**
 * Tests for the WHOOP -> decision trace.
 *
 * The trace's whole value is that it can be checked, unlike the prose rationale.
 * Two things matter most here:
 *
 *  1. `basis` must be honest. A decision that fell back to a default must say
 *     ASSUMED, because the UI renders that word as the difference between a
 *     measurement and a guess.
 *  2. `UNUSED_WEARABLE_SIGNALS` must stay true. It is a public claim that these
 *     fields influence nothing; if someone later makes strain load-bearing and
 *     forgets this list, the app would be understating what it acts on.
 */

import {
  proposeDay,
  UNUSED_WEARABLE_SIGNALS,
  type PlannerProfile,
  type WearableSignal,
} from "../lib/planner/propose-day";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  wakeTime: null,
  recoveryScore: null,
  sleepDurationMin: null,
  sleepPerformance: null,
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

console.log("\nWHOOP decision trace\n");

/* --- 1. a measured reading is reported as measured ----------------------- */
{
  const p = proposeDay({
    signal: { ...BLANK, wakeTime: "06:40", recoveryScore: 28 },
    profile: PROFILE,
    training: null,
  });

  const wake = p.trace.find((t) => t.input === "WHOOP_WAKE");
  check("measured wake is MEASURED", wake?.basis === "MEASURED", wake?.basis);
  check("measured wake shows the reading", wake?.reading === "06:40", String(wake?.reading));

  const rec = p.trace.find((t) => t.input === "WHOOP_RECOVERY");
  check("low recovery is MEASURED", rec?.basis === "MEASURED", rec?.basis);
  check("low recovery names its effect on bedtime", /45 minutes earlier/.test(rec?.effect ?? ""));
}

/* --- 2. an absent reading must not masquerade as measured ---------------- */
{
  const p = proposeDay({ signal: BLANK, profile: PROFILE, training: null });

  const wake = p.trace.find((t) => t.input === "WHOOP_WAKE");
  check("absent wake is ASSUMED", wake?.basis === "ASSUMED", wake?.basis);
  check("absent wake has null reading", wake?.reading === null, String(wake?.reading));

  const rec = p.trace.find((t) => t.input === "WHOOP_RECOVERY");
  check("absent recovery is ASSUMED", rec?.basis === "ASSUMED", rec?.basis);
  check("absent recovery has null reading", rec?.reading === null, String(rec?.reading));

  check(
    "no entry claims a reading it does not have",
    p.trace.every((t) => !(t.basis === "MEASURED" && t.reading === null)),
  );
}

/* --- 3. the 34-66 middle band still reports itself ----------------------- */
{
  const p = proposeDay({
    signal: { ...BLANK, recoveryScore: 50 },
    profile: PROFILE,
    training: null,
  });
  const rec = p.trace.find((t) => t.input === "WHOOP_RECOVERY");
  check("mid-band recovery still appears in the trace", rec !== undefined);
  check("mid-band recovery is MEASURED", rec?.basis === "MEASURED", rec?.basis);
  check("mid-band recovery shows its value", rec?.reading === "50%", String(rec?.reading));
  check(
    "mid-band explains that it changed nothing",
    /middle band/i.test(rec?.effect ?? ""),
    rec?.effect,
  );
}

/* --- 4. the unused-signal list must remain true -------------------------- */
{
  const src = readFileSync(join(process.cwd(), "lib/planner/propose-day.ts"), "utf8");

  // Only the planner body counts. `assessEvidence` reads sleepDurationMin to set
  // the confidence badge, which is not a planning decision, and the constant
  // itself names every field as a string.
  const body = src.slice(src.indexOf("export function proposeDay"));

  /*
   * Two distinct reasons a field can be unused, and both are worth asserting.
   *
   * `strain`, `sleepPerformance` and `sleepDurationMin` are on `WearableSignal`,
   * so they reach the planner and simply are not read — checked by regex.
   *
   * `hrvMs`, `restingHr` and `kcalBurned` are on the `wearable_daily` table but
   * not on `WearableSignal` at all, so they cannot influence planning even by
   * accident. That is the stronger guarantee, and asserting the weaker regex for
   * them would pass vacuously and prove nothing.
   */
  const signalType = src.slice(
    src.indexOf("export type WearableSignal"),
    src.indexOf("export type PlannerProfile"),
  );

  for (const s of UNUSED_WEARABLE_SIGNALS) {
    const onSignal = new RegExp(`\\b${s.field}\\b`).test(signalType);
    if (onSignal) {
      const used = new RegExp(`signal\\.${s.field}\\b`).test(body);
      check(
        `${s.field} reaches the planner but drives nothing`,
        !used,
        used
          ? `signal.${s.field} now drives a decision — move it out of UNUSED_WEARABLE_SIGNALS`
          : undefined,
      );
    } else {
      check(
        `${s.field} never reaches the planner at all`,
        true,
        undefined,
      );
    }
  }

  check(
    "every unused signal explains itself",
    UNUSED_WEARABLE_SIGNALS.every((s) => s.why.trim().length > 20),
  );
}

/* --- 5. control level always contributes a link -------------------------- */
{
  const unknown = proposeDay({
    signal: BLANK,
    profile: { ...PROFILE, controlLevel: "UNKNOWN" },
    training: null,
  });
  const c = unknown.trace.find((t) => t.input === "PROFILE_CONTROL");
  check("unknown control is ASSUMED", c?.basis === "ASSUMED", c?.basis);
  check("trace is never empty", unknown.trace.length > 0);
}

console.log(
  failures === 0
    ? "\nAll trace assertions passed.\n"
    : `\n${failures} assertion(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
