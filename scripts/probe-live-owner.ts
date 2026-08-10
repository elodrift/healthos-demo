/**
 * Read-only-ish probe: run the real buildLiveDay for the owner account against
 * live Neon + live WHOOP, and print what the planner actually received.
 *
 * This exists because the unit tests feed the planner synthetic signals. They
 * prove the maths; they cannot prove that `strain` and the training window
 * arrive non-null from the real WHOOP API — which was the entire C2 defect.
 *
 * Not part of `verify`: it hits a third-party API and depends on one specific
 * account, so it is a diagnostic to run by hand, not a gate.
 */
import { db } from "@/lib/db";
import { user, wearableDaily } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { buildLiveDay } from "@/lib/live/build-day";
import { fetchCycles, fetchWorkouts } from "@/lib/whoop/client";
import { pickCurrentCycle, pickTrainingWindow } from "@/lib/live/build-day";

const EMAIL = "patrick.luecker@outlook.com";

async function main() {
  const [owner] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);
  if (!owner) throw new Error(`No user found for ${EMAIL}`);
  console.log(`[probe] owner id=${owner.id}`);

  // --- raw WHOOP, so we can see whether strain exists at source -----------
  const [cycles, workouts] = await Promise.all([
    fetchCycles(owner.id, 3),
    fetchWorkouts(owner.id, 10),
  ]);
  const cycle = pickCurrentCycle(cycles.records);
  console.log(
    `[probe] cycles=${cycles.records.length} current=${cycle ? `${cycle.id} state=${cycle.score_state} strain=${cycle.score?.strain ?? "none"}` : "NONE (no open cycle)"}`,
  );
  console.log(
    `[probe] workouts=${workouts.records.length}`,
    workouts.records
      .slice(0, 3)
      .map((w) => `${w.sport_name ?? "?"}@${w.start}`)
      .join(", "),
  );

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[probe] training window for ${today}:`, pickTrainingWindow(workouts.records, today));

  // --- the real code path -------------------------------------------------
  const result = await buildLiveDay(owner.id, { force: true });
  console.log(`[probe] status=${result.status}`);
  if (result.status !== "OK") {
    console.log("[probe] blocked before planning; nothing further to inspect.");
    return;
  }

  const p = result.proposal;
  // `fromCache` is printed first and loudly: omitting it is how a silent fall
  // into the outage handler read as a successful live plan on the first run.
  console.log(
    `[probe] fromCache=${result.fromCache}${result.fromCache ? "  <-- NOT LIVE" : ""} cachedDay=${result.cachedDay ?? "-"}`,
  );
  console.log(`[probe] syncedAt=${result.syncedAt?.toISOString()} fresh=${result.servedFromFreshStore}`);
  console.log(`[probe] wake=${p.wakeTime} sleep=${p.sleepTime} control=${p.controlLevel}`);
  console.log(`[probe] training=${p.trainingStart ?? "none"}-${p.trainingEnd ?? ""} ${p.trainingType ?? ""}`);
  console.log(`[probe] dayTarget=`, p.dayTarget);
  console.log(`[probe] remaining=`, p.remaining);
  console.log(`[probe] replanNotes=`, p.replanNotes);
  console.log("[probe] trace:");
  for (const t of p.trace) {
    console.log(`   [${t.basis}] ${t.input} ${t.label}: ${t.reading} -> ${t.effect}`);
  }
  console.log("[probe] slots:");
  for (const s of p.slots) {
    console.log(
      `   ${s.slotTime} ${s.label} protein=${s.targetProteinG ?? "-"} carb=${s.targetCarbG ?? "-"} past=${s.isPast} adj=${s.adjustmentNote ?? "-"}`,
    );
  }

  // --- confirm strain was actually persisted, not just fetched ------------
  // Must be scoped to today. Ordering ascending and taking the first row read the
  // OLDEST day, which reported strain=null and looked like a persistence failure
  // long after persistence was fixed — a false negative is as bad as a false pass.
  const [row] = await db
    .select()
    .from(wearableDaily)
    .where(and(eq(wearableDaily.userId, owner.id), eq(wearableDaily.day, today)));
  console.log(
    `[probe] today's wearable_daily row: day=${row?.day ?? "MISSING"} strain=${row?.strain} kcal=${row?.kcalBurned}`,
  );
  if (row && row.strain === null) {
    console.log("[probe] WARNING: today's row exists but strain is null — the cache write dropped it.");
  }

  const strainTrace = p.trace.find((t) => t.input === "WHOOP_STRAIN");
  console.log(
    strainTrace
      ? `[probe] RESULT: strain is load-bearing -> "${strainTrace.effect}"`
      : `[probe] RESULT: no strain trace entry (strain was null at source)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[probe] FAILED:", e);
    process.exit(1);
  });
