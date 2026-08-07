/**
 * Live mode: turn real WHOOP data into a day proposal.
 *
 * This is the only place that joins the wearable, the onboarding profile and
 * the planner. It is deliberately the boundary layer — `lib/planner` stays
 * pure and knows nothing about the database or the API.
 *
 * The return type is a discriminated union rather than a nullable proposal so
 * the UI cannot accidentally render a plan built from nothing. Every failure
 * mode is named, because DNA §4.11 forbids presenting an assumption in the
 * same voice as a measurement.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { onboardingProfile, wearableConnection, wearableDaily } from "@/lib/db/schema";
import {
  fetchRecovery,
  fetchSleep,
  sleepMinutes,
  type WhoopSleep,
} from "@/lib/whoop/client";
import {
  proposeDay,
  type ControlLevel,
  type DayProposal,
  type GoalMode,
  type WearableSignal,
} from "@/lib/planner/propose-day";

export type LiveDayResult =
  | { status: "NO_WHOOP_APP"; }
  | { status: "NOT_CONNECTED" }
  | { status: "NO_GOAL" }
  | { status: "WHOOP_ERROR"; message: string; staleProposal: DayProposal | null }
  | {
      status: "OK";
      proposal: DayProposal;
      /** True when WHOOP was unreachable and this came from the last stored day. */
      fromCache: boolean;
      cachedDay: string | null;
    };

/**
 * Local clock time from an instant plus WHOOP's own UTC offset.
 *
 * WHOOP returns `end` as a UTC instant and `timezone_offset` as the offset that
 * was in force for the user at that moment ("+01:00", "-0500", "Z"). Formatting
 * the instant with the *server's* timezone would report a wake time in UTC — an
 * hour or more wrong for most users, and wrong in a way that silently poisons
 * every downstream meal time. So the offset is applied explicitly.
 *
 * Exported for testing.
 */
export function localTimeFromInstant(
  isoInstant: string,
  offset: string | null | undefined,
): string | null {
  const ms = Date.parse(isoInstant);
  if (Number.isNaN(ms)) return null;

  const offsetMin = parseOffsetMinutes(offset);
  if (offsetMin === null) return null;

  const shifted = new Date(ms + offsetMin * 60_000);
  const h = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Accepts "+01:00", "-0500", "+02", "Z". Returns minutes, or null if unusable. */
export function parseOffsetMinutes(offset: string | null | undefined): number | null {
  if (offset === null || offset === undefined) return null;
  const raw = offset.trim();
  if (raw === "" ) return null;
  if (raw === "Z" || raw === "z") return 0;

  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(raw);
  if (!m) return null;

  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const mins = m[3] === undefined ? 0 : Number(m[3]);
  if (hours > 23 || mins > 59) return null;

  return sign * (hours * 60 + mins);
}

/** The most recent non-nap sleep. Naps must not be read as last night. */
export function pickMainSleep(records: WhoopSleep[]): WhoopSleep | null {
  const nights = records.filter((r) => !r.nap);
  if (nights.length === 0) return null;
  return nights.reduce((latest, r) =>
    Date.parse(r.end) > Date.parse(latest.end) ? r : latest,
  );
}

function toSignal(args: {
  recoveryScore: number | null;
  wakeTime: string | null;
  sleepDurationMin: number | null;
  sleepPerformance: number | null;
  strain: number | null;
}): WearableSignal {
  return args;
}

export async function buildLiveDay(userId: string): Promise<LiveDayResult> {
  if (!process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET) {
    return { status: "NO_WHOOP_APP" };
  }

  const [conn] = await db
    .select()
    .from(wearableConnection)
    .where(
      and(eq(wearableConnection.userId, userId), eq(wearableConnection.provider, "whoop")),
    )
    .limit(1);

  if (!conn) return { status: "NOT_CONNECTED" };

  const [profileRow] = await db
    .select()
    .from(onboardingProfile)
    .where(eq(onboardingProfile.userId, userId))
    .limit(1);

  // The planner can run without a goal, but the result would not be a plan for
  // anything in particular. §116: onboarding is complete only when the engine
  // can answer "what is today's plan?" — no objective means it cannot.
  if (!profileRow?.objective) return { status: "NO_GOAL" };

  const plannerProfile = {
    typicalWakeTime: profileRow.typicalWakeTime,
    typicalSleepTime: profileRow.typicalSleepTime,
    mealsPerDay: profileRow.mealsPerDay,
    proteinTargetG: profileRow.proteinTargetG,
    proteinFloorG: profileRow.proteinFloorG,
    carbTargetG: profileRow.carbTargetG,
    kcalTarget: profileRow.kcalTarget,
    controlLevel: (profileRow.controlLevel ?? "UNKNOWN") as ControlLevel,
    goalMode: (profileRow.goalMode ?? null) as GoalMode | null,
  };

  try {
    const [recovery, sleep] = await Promise.all([
      fetchRecovery(userId, 1),
      fetchSleep(userId, 5),
    ]);

    const latestRecovery = recovery.records[0];
    const mainSleep = pickMainSleep(sleep.records);

    const signal = toSignal({
      recoveryScore:
        latestRecovery?.score_state === "SCORED"
          ? (latestRecovery.score?.recovery_score ?? null)
          : null,
      wakeTime: mainSleep ? localTimeFromInstant(mainSleep.end, mainSleep.timezone_offset) : null,
      sleepDurationMin: mainSleep ? sleepMinutes(mainSleep) : null,
      sleepPerformance:
        mainSleep?.score_state === "SCORED"
          ? (mainSleep.score?.sleep_performance_percentage ?? null)
          : null,
      strain: null,
    });

    await persistDaily(userId, signal, mainSleep);

    return {
      status: "OK",
      proposal: proposeDay({ signal, profile: plannerProfile, training: null }),
      fromCache: false,
      cachedDay: null,
    };
  } catch (error) {
    // WHOOP being down must not blank the day. Fall back to the last stored
    // reading and say so, rather than silently planning from the profile as if
    // it were measured.
    const [cached] = await db
      .select()
      .from(wearableDaily)
      .where(and(eq(wearableDaily.userId, userId), eq(wearableDaily.provider, "whoop")))
      .orderBy(desc(wearableDaily.day))
      .limit(1);

    const message = error instanceof Error ? error.message : "WHOOP request failed.";

    if (!cached) return { status: "WHOOP_ERROR", message, staleProposal: null };

    const signal = toSignal({
      recoveryScore: cached.recoveryScore,
      wakeTime: cached.sleepEnd
        ? localTimeFromInstant(cached.sleepEnd.toISOString(), "Z")
        : null,
      sleepDurationMin: cached.sleepDurationMin,
      sleepPerformance: cached.sleepPerformance,
      strain: cached.strain,
    });

    return {
      status: "OK",
      proposal: proposeDay({ signal, profile: plannerProfile, training: null }),
      fromCache: true,
      cachedDay: cached.day,
    };
  }
}

/** Store today's rollup so a later WHOOP outage has something truthful to use. */
async function persistDaily(
  userId: string,
  signal: WearableSignal,
  mainSleep: WhoopSleep | null,
) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(wearableDaily)
    .values({
      userId,
      provider: "whoop",
      day,
      recoveryScore: signal.recoveryScore,
      sleepDurationMin: signal.sleepDurationMin,
      sleepPerformance: signal.sleepPerformance,
      sleepStart: mainSleep ? new Date(mainSleep.start) : null,
      sleepEnd: mainSleep ? new Date(mainSleep.end) : null,
    })
    .onConflictDoUpdate({
      target: [wearableDaily.userId, wearableDaily.provider, wearableDaily.day],
      set: {
        recoveryScore: signal.recoveryScore,
        sleepDurationMin: signal.sleepDurationMin,
        sleepPerformance: signal.sleepPerformance,
        fetchedAt: new Date(),
      },
    });
}
