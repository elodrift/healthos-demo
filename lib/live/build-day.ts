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
import {
  mealLog,
  onboardingProfile,
  wearableConnection,
  wearableDaily,
} from "@/lib/db/schema";
import {
  fetchCycles,
  fetchRecovery,
  fetchSleep,
  fetchWorkouts,
  kjToKcal,
  sleepMinutes,
  type WhoopCycle,
  type WhoopSleep,
  type WhoopWorkout,
} from "@/lib/whoop/client";
import {
  parseTime,
  proposeDay,
  type ConsumedMeal,
  type ControlLevel,
  type DayProposal,
  type GoalMode,
  type TrainingWindow,
  type WearableSignal,
} from "@/lib/planner/propose-day";
import { localDay } from "@/lib/live/local-day";

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
      /**
       * When the wearable data behind this plan was actually pulled from WHOOP.
       *
       * The UI needs this to say how old the advice is. A recovery score from
       * 09:00 driving a plan being read at 22:00 is not wrong, but presenting it
       * without its age invites the user to believe it is current.
       */
      syncedAt: Date | null;
      /**
       * True when this render reused stored data instead of calling WHOOP because
       * the last sync was still inside the freshness window. Distinct from
       * `fromCache`, which means WHOOP was *tried and failed*.
       */
      servedFromFreshStore: boolean;
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

/**
 * How long a WHOOP pull stays good enough to reuse.
 *
 * Recovery is scored once per night and strain accrues slowly, so re-fetching on
 * every page view spends rate limit to redraw the same numbers. Fifteen minutes
 * is short enough that a post-workout strain change surfaces quickly and long
 * enough that opening the app three times in a row is one request.
 */
export const SYNC_TTL_MS = 15 * 60 * 1000;

export function isFresh(lastSyncedAt: Date | null, now: Date): boolean {
  if (!lastSyncedAt) return false;
  return now.getTime() - lastSyncedAt.getTime() < SYNC_TTL_MS;
}

/**
 * The cycle covering today, for strain.
 *
 * WHOOP's current cycle has `end: null`; completed ones are yesterday and
 * earlier. Reading strain off the newest *completed* cycle would attribute
 * yesterday's training to today, which is exactly the kind of confident-but-wrong
 * input that makes an adaptive plan worse than a static one.
 *
 * Exported for testing.
 */
export function pickCurrentCycle(records: WhoopCycle[]): WhoopCycle | null {
  const open = records.filter((c) => c.end === null);
  if (open.length > 0) {
    return open.reduce((latest, c) =>
      Date.parse(c.start) > Date.parse(latest.start) ? c : latest,
    );
  }
  return null;
}

/**
 * Today's training window, from the user's recorded workouts.
 *
 * Only workouts that started on the given local day count. `training` was
 * hardcoded to null before this, which meant the planner's pre- and
 * post-training slots were unreachable code: the logic existed and could never
 * fire. The type stays nullable because "no workout today" is a real answer.
 *
 * Exported for testing.
 */
export function pickTrainingWindow(
  records: WhoopWorkout[],
  day: string,
): TrainingWindow {
  const todays = records.filter((w) => {
    const start = localTimeFromInstant(w.start, w.timezone_offset);
    if (start === null) return false;
    const offsetMin = parseOffsetMinutes(w.timezone_offset);
    if (offsetMin === null) return false;
    const shifted = new Date(Date.parse(w.start) + offsetMin * 60_000);
    return shifted.toISOString().slice(0, 10) === day;
  });

  if (todays.length === 0) return null;

  // The longest session is the one worth planning meals around; a 10-minute walk
  // logged after a 90-minute lift should not become the anchor.
  const main = todays.reduce((longest, w) => {
    const len = Date.parse(w.end) - Date.parse(w.start);
    const best = Date.parse(longest.end) - Date.parse(longest.start);
    return len > best ? w : longest;
  });

  const start = localTimeFromInstant(main.start, main.timezone_offset);
  const end = localTimeFromInstant(main.end, main.timezone_offset);
  if (start === null || end === null) return null;

  return { start, end, type: main.sport_name ?? null };
}

/** Today's logged meals, in the planner's shape. Always scoped to the user. */
async function loadConsumed(userId: string, day: string): Promise<ConsumedMeal[]> {
  const rows = await db
    .select()
    .from(mealLog)
    .where(and(eq(mealLog.userId, userId), eq(mealLog.day, day)));

  return rows.map((r) => ({
    // `loggedAt` is when it was recorded, which is the best available stand-in
    // for when it was eaten. It is not the same claim, so the planner treats a
    // missing value as unknown rather than assuming a time.
    atMinutes: r.loggedAt ? r.loggedAt.getHours() * 60 + r.loggedAt.getMinutes() : null,
    proteinG: r.proteinG,
    carbG: r.carbG,
    kcal: r.kcal,
    confidence: (r.confidence ?? "LOW") as "LOW" | "MEDIUM" | "HIGH",
    estimated: r.estimated ?? true,
  }));
}

/**
 * Minutes since local midnight, in the user's own zone where we know it.
 *
 * Derived from WHOOP's reported offset rather than the server clock, for the same
 * reason `localTimeFromInstant` exists: a server in UTC would place a London
 * evening an hour earlier and quietly mark the last meal slot as still ahead.
 */
/**
 * The calendar day `now` falls on, given a fixed UTC offset.
 *
 * `localDay` needs an IANA zone name, which WHOOP does not send — it sends the
 * offset that was in force. This is the offset-shaped equivalent, and it is what
 * decides which day's meals get subtracted from which day's plan.
 *
 * Exported for testing.
 */
export function localDayFromOffset(
  now: Date,
  offset: string | null | undefined,
): string | null {
  const offsetMin = parseOffsetMinutes(offset);
  if (offsetMin === null) return null;
  return new Date(now.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);
}

function nowMinutesIn(offset: string | null | undefined, now: Date): number | null {
  const offsetMin = parseOffsetMinutes(offset);
  if (offsetMin === null) return null;
  const shifted = new Date(now.getTime() + offsetMin * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export async function buildLiveDay(
  userId: string,
  options?: {
    /** Skip the freshness window and pull from WHOOP now. Set by manual refresh. */
    force?: boolean;
    /** Injectable clock, so the freshness window is testable. */
    now?: Date;
  },
): Promise<LiveDayResult> {
  const now = options?.now ?? new Date();
  const force = options?.force ?? false;
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

  /*
   * Reuse a recent pull rather than calling WHOOP on every render.
   *
   * Only today's stored row qualifies: yesterday's numbers inside the freshness
   * window would be fresh by the clock and wrong by a day. A manual refresh
   * bypasses this entirely, which is what makes "check again after training" an
   * action the user can actually take rather than a wait.
   */
  if (!force && isFresh(conn.lastSyncedAt, now)) {
    const storedDay = localDay(now, "UTC") ?? new Date().toISOString().slice(0, 10);
    const [todayRow] = await db
      .select()
      .from(wearableDaily)
      .where(
        and(
          eq(wearableDaily.userId, userId),
          eq(wearableDaily.provider, "whoop"),
          eq(wearableDaily.day, storedDay),
        ),
      )
      .limit(1);

    if (todayRow) {
      const signal = toSignal({
        recoveryScore: todayRow.recoveryScore,
        wakeTime: todayRow.sleepEnd
          ? localTimeFromInstant(todayRow.sleepEnd.toISOString(), "Z")
          : null,
        sleepDurationMin: todayRow.sleepDurationMin,
        sleepPerformance: todayRow.sleepPerformance,
        strain: todayRow.strain,
      });

      return {
        status: "OK",
        proposal: proposeDay({
          signal,
          profile: plannerProfile,
          training: null,
          consumed: await loadConsumed(userId, storedDay),
          nowMinutes: nowMinutesIn("Z", now),
        }),
        fromCache: false,
        cachedDay: null,
        syncedAt: conn.lastSyncedAt,
        servedFromFreshStore: true,
      };
    }
  }

  try {
    const [recovery, sleep, cycles, workouts] = await Promise.all([
      fetchRecovery(userId, 1),
      fetchSleep(userId, 5),
      fetchCycles(userId, 3),
      fetchWorkouts(userId, 10),
    ]);

    const latestRecovery = recovery.records[0];
    const mainSleep = pickMainSleep(sleep.records);
    const cycle = pickCurrentCycle(cycles.records);

    /*
     * Strain only counts once WHOOP has scored the cycle. An unscored cycle
     * carries no strain figure, and treating its absence as zero would tell the
     * planner the user had an unusually easy day — moving carbs down on no
     * evidence at all.
     */
    const strain =
      cycle?.score_state === "SCORED" ? (cycle.score?.strain ?? null) : null;

    const offset = mainSleep?.timezone_offset ?? null;
    const day =
      (offset ? localDayFromOffset(now, offset) : null) ??
      localDay(now, "UTC") ??
      new Date().toISOString().slice(0, 10);

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
      strain,
    });

    const training = pickTrainingWindow(workouts.records, day);
    const kcalBurned =
      cycle?.score_state === "SCORED" && cycle.score?.kilojoule !== undefined
        ? kjToKcal(cycle.score.kilojoule)
        : null;

    await persistDaily(userId, signal, mainSleep, kcalBurned);
    await db
      .update(wearableConnection)
      .set({ lastSyncedAt: now, syncError: null, updatedAt: now })
      .where(
        and(
          eq(wearableConnection.userId, userId),
          eq(wearableConnection.provider, "whoop"),
        ),
      );

    return {
      status: "OK",
      proposal: proposeDay({
        signal,
        profile: plannerProfile,
        training,
        consumed: await loadConsumed(userId, day),
        nowMinutes: nowMinutesIn(offset ?? "Z", now),
      }),
      fromCache: false,
      cachedDay: null,
      syncedAt: now,
      servedFromFreshStore: false,
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
