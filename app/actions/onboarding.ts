"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { onboardingProfile } from "@/lib/db/schema";

/**
 * There is no RLS on Neon, so every query below scopes by this id explicitly.
 * Throwing (rather than returning null) keeps callers from accidentally
 * treating an unauthenticated request as a valid one.
 */
async function getUserId(): Promise<string> {
  // Next 14.2: headers() is synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

const GOAL_MODES = ["STRICT_HEALTHY", "FAST_AGGRESSIVE"] as const;
const CONTROL_LEVELS = ["FULL", "PARTIAL", "MINIMAL", "UNKNOWN"] as const;

export type GoalFormState = { error?: string; ok?: boolean };

/**
 * Save the §6 Step 2 goal contract.
 *
 * `goalMode` and `controlLevel` are validated against closed sets because the
 * planner switches behaviour on them — an unrecognised value would silently
 * fall through to default handling and produce a plan that ignores the user's
 * stated intent.
 */
export async function saveGoalContract(
  _prev: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  let userId: string;
  try {
    userId = await getUserId();
  } catch {
    return { error: "Your session expired. Sign in again." };
  }

  const objective = String(formData.get("objective") ?? "").trim();
  const goalMode = String(formData.get("goalMode") ?? "");
  const controlLevel = String(formData.get("controlLevel") ?? "UNKNOWN");
  const targetDateRaw = String(formData.get("targetDate") ?? "").trim();

  if (!objective) return { error: "Describe what you're optimising for." };
  if (objective.length > 500) {
    return { error: "Keep the objective under 500 characters." };
  }
  if (!GOAL_MODES.includes(goalMode as (typeof GOAL_MODES)[number])) {
    return { error: "Choose how aggressively to pursue this." };
  }
  if (!CONTROL_LEVELS.includes(controlLevel as (typeof CONTROL_LEVELS)[number])) {
    return { error: "Choose how much control you have over your food." };
  }

  // A target date in the past would make every "days remaining" calculation
  // negative, so it is rejected here rather than handled downstream.
  let targetDate: string | null = null;
  if (targetDateRaw) {
    const parsed = new Date(targetDateRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "That target date isn't valid." };
    }
    const today = new Date().toISOString().slice(0, 10);
    if (targetDateRaw < today) {
      return { error: "The target date is in the past." };
    }
    targetDate = targetDateRaw;
  }

  /*
    Protein target and floor. Both optional: the planner and /live are built to
    say "no target set" rather than invent one, so a blank field must stay null
    instead of becoming a default. A silent default here would be the exact
    §4.11 failure — the app presenting its own guess as the user's intent.

    Bounds are sanity rails, not advice. 20g is below any plausible daily intake
    and 400g is past the top of the sports-nutrition range, so a number outside
    them is far more likely a typo (1600 for 160) than a real goal. Rejecting is
    right: a mistyped target silently reshapes every plan that follows.
  */
  function parseGrams(
    field: string,
    noun: string,
    min: number,
    max: number,
  ): number | null | { error: string } {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    if (!/^\d{1,4}$/.test(raw)) return { error: `Enter ${noun} in whole grams.` };
    const n = Number(raw);
    if (n < min || n > max) {
      const Noun = noun[0].toUpperCase() + noun.slice(1);
      return { error: `${Noun} should be between ${min}g and ${max}g a day.` };
    }
    return n;
  }

  const targetParsed = parseGrams("proteinTargetG", "protein", 20, 400);
  if (targetParsed !== null && typeof targetParsed === "object") return targetParsed;
  const floorParsed = parseGrams("proteinFloorG", "protein", 20, 400);
  if (floorParsed !== null && typeof floorParsed === "object") return floorParsed;

  /*
    Carbohydrate uses a wider rail than protein on purpose. Ketogenic targets
    legitimately sit under 20g, and 8g/kg for a large endurance athlete reaches
    ~800g, so protein's 20–400 window would reject real goals at both ends.
    Still a typo rail: 2400 for 240 is caught.

    This is the field the strain logic needs. WHOOP strain only moves carbs, and
    only when a gram-level carb target exists — with no way to enter one, that
    branch was unreachable for every real user and the trace could only ever say
    "read, but this day carries no gram-level carb target for it to move".
  */
  const carbParsed = parseGrams("carbTargetG", "carbohydrate", 10, 800);
  if (carbParsed !== null && typeof carbParsed === "object") return carbParsed;

  /*
    Calories. Wider still, because the rail has to admit both a small person in
    a deficit and a large athlete in a surplus without rejecting either.
  */
  const kcalParsed = parseKcal();
  if (kcalParsed !== null && typeof kcalParsed === "object") return kcalParsed;

  function parseKcal(): number | null | { error: string } {
    const raw = String(formData.get("kcalTarget") ?? "").trim();
    if (!raw) return null;
    if (!/^\d{3,5}$/.test(raw)) return { error: "Enter calories as a whole number." };
    const n = Number(raw);
    if (n < 800 || n > 6000) {
      return { error: "Calories should be between 800 and 6000 a day." };
    }
    return n;
  }

  /*
    The daily rhythm: wake time, bedtime, meal count.

    These were the last planner inputs with no write path. Every meal time on
    /live is an offset from wake, so with nothing on file the planner fell back
    to 07:00 and built the whole schedule on a guess the user could not correct.
    Same for the meal count, which silently assumed 3.

    Stored as "HH:MM" text to match the column and `parseTime` in the planner.
    A time input already constrains the format client-side, so this check is
    defence against a hand-posted body rather than a typing aid.
  */
  function parseClock(field: string, noun: string): string | null | { error: string } {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
      return { error: `Enter ${noun} as a 24-hour time, like 07:00.` };
    }
    return raw;
  }

  const wakeParsed = parseClock("typicalWakeTime", "your usual wake time");
  if (wakeParsed !== null && typeof wakeParsed === "object") return wakeParsed;
  const sleepParsed = parseClock("typicalSleepTime", "your usual bedtime");
  if (sleepParsed !== null && typeof sleepParsed === "object") return sleepParsed;

  /*
    Meals per day. The planner clamps this by control level (MINIMAL caps at 2,
    PARTIAL at 3, FULL 3–6), so a value outside 1–8 could never survive anyway;
    rejecting here means the stored number is the one the user actually chose
    rather than something silently rewritten on read.
  */
  let mealsPerDay: number | null = null;
  const mealsRaw = String(formData.get("mealsPerDay") ?? "").trim();
  if (mealsRaw) {
    if (!/^\d{1,2}$/.test(mealsRaw)) return { error: "Enter meals per day as a number." };
    const n = Number(mealsRaw);
    if (n < 1 || n > 8) return { error: "Meals per day should be between 1 and 8." };
    mealsPerDay = n;
  }

  const proteinTargetG = targetParsed;
  const proteinFloorG = floorParsed;
  const carbTargetG = carbParsed;
  const kcalTarget = kcalParsed;
  const typicalWakeTime = wakeParsed;
  const typicalSleepTime = sleepParsed;

  // A floor above the target is contradictory: the floor exists as the reduced
  // commitment for low-control days, so this is almost always the two swapped.
  if (proteinTargetG !== null && proteinFloorG !== null && proteinFloorG > proteinTargetG) {
    return { error: "The floor can't be higher than the target." };
  }

  // A floor with no target has nothing to be a floor of, and /live would label
  // it FLOOR while comparing against it as the only figure available.
  if (proteinFloorG !== null && proteinTargetG === null) {
    return { error: "Set a protein target before setting a floor." };
  }

  const values = {
    objective,
    goalMode,
    controlLevel,
    targetDate,
    proteinTargetG,
    proteinFloorG,
    carbTargetG,
    kcalTarget,
    typicalWakeTime,
    typicalSleepTime,
    mealsPerDay,
    updatedAt: new Date(),
  };

  const existing = await db
    .select({ id: onboardingProfile.id })
    .from(onboardingProfile)
    .where(eq(onboardingProfile.userId, userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(onboardingProfile)
      .set(values)
      .where(eq(onboardingProfile.userId, userId));
  } else {
    await db.insert(onboardingProfile).values({ userId, ...values });
  }

  revalidatePath("/onboarding");
  return { ok: true };
}
