/**
 * The facts the agent is allowed to talk about, derived on the server.
 *
 * The deleted demo's chat endpoint accepted `state` in the POST body: the
 * *client* told the server what the user's targets and intake were, and the
 * server put those numbers in the prompt. That is not a small flaw. Anyone could
 * POST `{ state: { remainingProtein: 400 } }` and get the agent to affirm it in
 * the product's authoritative voice — a fabricated nutrition claim laundered
 * through a trusted surface. §4.11's ban on presenting assumptions as
 * measurements is unenforceable if the measurement arrives from outside.
 *
 * So nothing here comes from the request. Everything is read from the database
 * and the planner for the *session's* user id.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealLog, onboardingProfile } from "@/lib/db/schema";
import { buildLiveDay } from "@/lib/live/build-day";
import { localDay } from "@/lib/live/local-day";
import type { DayProposal } from "@/lib/planner/propose-day";

export type LoggedTotals = {
  proteinG: number;
  carbG: number;
  fatG: number;
  kcal: number;
  /** Number of meals logged today, so "nothing yet" can be said honestly. */
  count: number;
  /**
   * True when any contributing row was an estimate. A total built from
   * estimates is itself an estimate, and must not be quoted as a measurement.
   */
  anyEstimated: boolean;
};

export type AgentSnapshot = {
  /** Null when the planner has nothing to say (no WHOOP, no goal, error). */
  proposal: DayProposal | null;
  /** Why there is no proposal, in the planner's own vocabulary. */
  unavailable:
    | "NO_WHOOP_APP"
    | "NOT_CONNECTED"
    | "NO_GOAL"
    | "WHOOP_ERROR"
    | null;
  /** True when the proposal came from cache because WHOOP was unreachable. */
  fromCache: boolean;
  logged: LoggedTotals;
  /**
   * Free text the user wrote at onboarding. Carried so the agent can *defer* to
   * it, never so it can reason from it — see the `trips` note in nlu.ts.
   */
  medicalNotes: string | null;
  /** Local calendar day used for the "today" window, YYYY-MM-DD. */
  day: string;
  /**
   * True when the browser's timezone was unusable and `day` came from the server
   * clock instead. Surfaced rather than swallowed: the totals may belong to a
   * different calendar day than the user thinks.
   */
  dayFromFallback: boolean;
};

/**
 * The user's own calendar day, not the server's.
 *
 * `timeZone` comes from the browser and is passed in rather than derived here.
 * An earlier draft of this file used `new Date().toISOString().slice(0, 10)`,
 * which is the exact bug `localDay` was written to prevent: in Bangkok (UTC+7) a
 * 20:00 dinner is already tomorrow in UTC, so the agent would compare tonight's
 * meals against tomorrow's targets and report totals that match neither day.
 *
 * An unrecognised zone falls back to the server day *and says so* via the
 * returned `dayFromFallback`, because a silently wrong day is worse than a
 * flagged one.
 */
export async function buildAgentSnapshot(
  userId: string,
  timeZone: string,
): Promise<AgentSnapshot> {
  const resolved = localDay(new Date(), timeZone);
  const day = resolved ?? new Date().toISOString().slice(0, 10);

  const [live, logs, profileRows] = await Promise.all([
    buildLiveDay(userId),
    db
      .select()
      .from(mealLog)
      .where(and(eq(mealLog.userId, userId), gte(mealLog.day, day)))
      .orderBy(desc(mealLog.loggedAt)),
    db
      .select({ medicalNotes: onboardingProfile.medicalNotes })
      .from(onboardingProfile)
      .where(eq(onboardingProfile.userId, userId))
      .limit(1),
  ]);

  const logged = logs.reduce<LoggedTotals>(
    (acc, row) => ({
      proteinG: acc.proteinG + (row.proteinG ?? 0),
      carbG: acc.carbG + (row.carbG ?? 0),
      fatG: acc.fatG + (row.fatG ?? 0),
      kcal: acc.kcal + (row.kcal ?? 0),
      count: acc.count + 1,
      anyEstimated: acc.anyEstimated || row.estimated,
    }),
    { proteinG: 0, carbG: 0, fatG: 0, kcal: 0, count: 0, anyEstimated: false },
  );

  return {
    proposal: live.status === "OK" ? live.proposal : null,
    unavailable: live.status === "OK" ? null : live.status,
    fromCache: live.status === "OK" ? live.fromCache : false,
    logged,
    medicalNotes: profileRows[0]?.medicalNotes ?? null,
    day,
    dayFromFallback: resolved === null,
  };
}
