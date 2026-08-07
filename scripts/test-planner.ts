import {
  assessEvidence,
  proposeDay,
  type PlannerProfile,
  type WearableSignal,
} from "../lib/planner/propose-day";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const fullControl: PlannerProfile = {
  typicalWakeTime: "07:00",
  typicalSleepTime: "23:00",
  mealsPerDay: 4,
  proteinTargetG: 160,
  proteinFloorG: 110,
  carbTargetG: 240,
  kcalTarget: 2400,
  controlLevel: "FULL",
  goalMode: "STRICT_HEALTHY",
};

const measured: WearableSignal = {
  recoveryScore: 72,
  wakeTime: "06:38",
  sleepDurationMin: 447,
  sleepPerformance: 88,
  strain: 11.4,
};

const nothing: WearableSignal = {
  recoveryScore: null,
  wakeTime: null,
  sleepDurationMin: null,
  sleepPerformance: null,
  strain: null,
};

console.log("\n1. Measured day, full control");
{
  const p = proposeDay({ signal: measured, profile: fullControl, training: null });
  check("evidence is MEASURED", p.evidence === "MEASURED", p.evidence);
  // A measured wake time is reported exactly. Rounding 06:38 to 06:45 would
  // distort a real measurement; only derived slot times get rounded.
  check("wake is the exact measured time", p.wakeTime === "06:38", p.wakeTime);
  check(
    "derived slot times are rounded to :15",
    p.slots.every((s) => Number(s.slotTime.slice(3)) % 15 === 0),
    p.slots.map((s) => s.slotTime).join(","),
  );
  check("4 slots", p.slots.length === 4, String(p.slots.length));
  check(
    "precise protein per slot (160/4)",
    p.slots[0].targetProteinG === 40,
    String(p.slots[0].targetProteinG),
  );
  check("precise carbs present", p.slots[0].targetCarbG === 60, String(p.slots[0].targetCarbG));
  check("no one-decision nudge at full control", p.slots[0].oneDecision === null);
  check("slots are ordered", p.slots.every((s, i) => i === 0 || s.slotTime > p.slots[i - 1].slotTime));
  check("rationale cites the measured wake", p.rationale.some((r) => r.includes("06:38")));
}

console.log("\n2. No wearable data at all (the state apps usually fake)");
{
  const p = proposeDay({ signal: nothing, profile: fullControl, training: null });
  check("evidence is PROFILE_ONLY", p.evidence === "PROFILE_ONLY", p.evidence);
  check("falls back to usual wake", p.wakeTime === "07:00", p.wakeTime);
  check("says it has no recovery score", p.rationale.some((r) => r.toLowerCase().includes("no recovery")));
  check("says wake was not measured", p.rationale.some((r) => r.includes("No wake time")));
  check("does not invent a recovery number", !p.rationale.some((r) => /\d+%/.test(r)));
}

console.log("\n3. Low control -> no precision theater (§4.11)");
{
  const p = proposeDay({
    signal: measured,
    profile: { ...fullControl, controlLevel: "MINIMAL" },
    training: null,
  });
  check("slots capped at 2", p.slots.length === 2, String(p.slots.length));
  check("no carb targets emitted", p.slots.every((s) => s.targetCarbG === null));
  check("no kcal targets emitted", p.slots.every((s) => s.targetKcal === null));
  check("protein still defended", p.slots.every((s) => s.targetProteinG !== null));
  check(
    "protein uses the floor not the target (110/2)",
    p.slots[0].targetProteinG === 55,
    String(p.slots[0].targetProteinG),
  );
  check("one decision per slot", p.slots.every((s) => Boolean(s.oneDecision)));
  check("explains why it is less precise", p.rationale.some((r) => r.includes("protein floor")));
}

console.log("\n4. Low recovery pulls bedtime earlier");
{
  const p = proposeDay({
    signal: { ...measured, recoveryScore: 21 },
    profile: fullControl,
    training: null,
  });
  check("bedtime moved 45m earlier", p.sleepTime === "22:15", p.sleepTime);
  check("explains the shift", p.rationale.some((r) => r.includes("21%")));
}

console.log("\n5. Training reorders eating");
{
  const p = proposeDay({
    signal: measured,
    profile: fullControl,
    training: { start: "17:30", end: "18:45", type: "lifting" },
  });
  const labels = p.slots.map((s) => s.label);
  check("a pre- or post-training slot exists", labels.some((l) => l.includes("training")), labels.join(","));
  check("rationale mentions training", p.rationale.some((r) => r.includes("17:30")));
}

console.log("\n6. §8 open question is deferred, not invented");
{
  const p = proposeDay({
    signal: measured,
    profile: { ...fullControl, goalMode: "FAST_AGGRESSIVE" },
    training: null,
  });
  check("defers the guardrail decision", p.deferrals.some((d) => d.includes("§8")));
  check("plans conservatively meanwhile", p.deferrals.some((d) => d.includes("conservatively")));
}

console.log("\n7. §4.12 proposal is never pre-applied");
{
  const p = proposeDay({ signal: measured, profile: fullControl, training: null });
  check("states nothing applies until confirmed", p.deferrals.some((d) => d.includes("confirm")));
}

console.log("\n8. Evidence tiers");
{
  check("partial when only wake known", assessEvidence({ ...nothing, wakeTime: "06:30" }) === "PARTIAL");
  check("partial when only recovery known", assessEvidence({ ...nothing, recoveryScore: 50 }) === "PARTIAL");
  check("profile-only when empty", assessEvidence(nothing) === "PROFILE_ONLY");
}

console.log("\n9. Malformed profile times fall back instead of poisoning the plan");
{
  for (const bad of ["", "not-a-time", "99:99", "7:5"]) {
    const p = proposeDay({
      signal: nothing,
      profile: { ...fullControl, typicalWakeTime: bad, typicalSleepTime: bad },
      training: null,
    });
    check(
      `"${bad}" -> valid HH:MM wake`,
      /^\d{2}:\d{2}$/.test(p.wakeTime),
      p.wakeTime,
    );
    check(
      `"${bad}" -> all slot times valid`,
      p.slots.every((s) => /^\d{2}:\d{2}$/.test(s.slotTime)),
      p.slots.map((s) => s.slotTime).join(","),
    );
  }
}

console.log(
  failures === 0
    ? "\nAll planner checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
