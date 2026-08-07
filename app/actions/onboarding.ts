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
  function parseGrams(field: string): number | null | { error: string } {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    if (!/^\d{1,4}$/.test(raw)) return { error: "Enter protein in whole grams." };
    const n = Number(raw);
    if (n < 20 || n > 400) {
      return { error: "Protein should be between 20g and 400g a day." };
    }
    return n;
  }

  const targetParsed = parseGrams("proteinTargetG");
  if (targetParsed !== null && typeof targetParsed === "object") return targetParsed;
  const floorParsed = parseGrams("proteinFloorG");
  if (floorParsed !== null && typeof floorParsed === "object") return floorParsed;

  const proteinTargetG = targetParsed;
  const proteinFloorG = floorParsed;

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
