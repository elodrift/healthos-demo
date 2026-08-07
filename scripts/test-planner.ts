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

console.log("\n10. Day target — the figure /live compares logged meals against");
{
  const p = proposeDay({ signal: measured, profile: fullControl, training: null });
  check("full control -> TARGET", p.dayTarget.proteinKind === "TARGET", p.dayTarget.proteinKind);
  check("full control -> uses the target", p.dayTarget.proteinG === 160, String(p.dayTarget.proteinG));
  check("full control -> carbs present", p.dayTarget.carbG === 240, String(p.dayTarget.carbG));
  check("full control -> kcal present", p.dayTarget.kcal === 2400, String(p.dayTarget.kcal));

  // The day total must be the planner's own commitment, not the sum of the
  // per-slot rounded figures. 160/4 divides cleanly; 160/3 does not, so this is
  // the case that would expose a UI re-adding the slots.
  const odd = proposeDay({
    signal: measured,
    profile: { ...fullControl, mealsPerDay: 3 },
    training: null,
  });
  const slotSum = odd.slots.reduce((n, s) => n + (s.targetProteinG ?? 0), 0);
  check(
    "day total stays exact when slots round (160/3)",
    odd.dayTarget.proteinG === 160 && slotSum !== 160,
    `day=${odd.dayTarget.proteinG} slotSum=${slotSum}`,
  );

  // Low control defends the floor, and the label must say so.
  const minimal = proposeDay({
    signal: measured,
    profile: { ...fullControl, controlLevel: "MINIMAL" },
    training: null,
  });
  check("minimal -> FLOOR", minimal.dayTarget.proteinKind === "FLOOR", minimal.dayTarget.proteinKind);
  check("minimal -> floor figure (110)", minimal.dayTarget.proteinG === 110, String(minimal.dayTarget.proteinG));
  check("minimal -> no carb target", minimal.dayTarget.carbG === null, String(minimal.dayTarget.carbG));
  check("minimal -> no kcal target", minimal.dayTarget.kcal === null, String(minimal.dayTarget.kcal));

  // The mislabel trap: an imprecise day with no floor set falls back to the
  // target, so it must not then be presented as a floor.
  const noFloor = proposeDay({
    signal: measured,
    profile: { ...fullControl, controlLevel: "MINIMAL", proteinFloorG: null },
    training: null,
  });
  check(
    "imprecise + no floor -> labelled TARGET, not FLOOR",
    noFloor.dayTarget.proteinKind === "TARGET",
    noFloor.dayTarget.proteinKind,
  );
  check(
    "imprecise + no floor -> falls back to the target figure",
    noFloor.dayTarget.proteinG === 160,
    String(noFloor.dayTarget.proteinG),
  );

  // Null, never 0. "Your target is 0g protein" is a worse lie than no number.
  const empty = proposeDay({
    signal: nothing,
    profile: {
      ...fullControl,
      proteinTargetG: null,
      proteinFloorG: null,
      carbTargetG: null,
      kcalTarget: null,
    },
    training: null,
  });
  check("no targets set -> null, never 0", empty.dayTarget.proteinG === null, String(empty.dayTarget.proteinG));
}

console.log(
  failures === 0
    ? "\nAll planner checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
