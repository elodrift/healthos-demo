"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { wearableConnection } from "@/lib/db/schema";

/** Same discipline as the community actions: no RLS, so scope every query by id. */
async function getUserId(): Promise<string> {
  // Next 14.2: headers() is synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * The shortest gap allowed between two manual refreshes.
 *
 * Separate from `SYNC_TTL_MS`, and deliberately much smaller. The TTL decides
 * when a *page view* may reuse stored data; this only stops the button being
 * held down. Reusing the 15-minute TTL here would make the control lie — it
 * would appear to refresh and silently do nothing for a quarter of an hour,
 * which is worse than not offering it.
 */
const MANUAL_REFRESH_COOLDOWN_MS = 30 * 1000;

export type RefreshResult =
  | { ok: true }
  | { ok: false; reason: "COOLDOWN"; retryInSeconds: number }
  | { ok: false; reason: "NOT_CONNECTED" };

/**
 * Force the next `/live` render to pull from WHOOP instead of reusing the store.
 *
 * This exists because strain is the one planner input that moves during the day:
 * recovery is fixed at wake, but finishing a session at 18:00 changes the carb
 * target, and without a way to ask for that the user would be told to wait an
 * unspecified time for the number they can see on their watch.
 *
 * It clears `lastSyncedAt` rather than fetching here. The fetch belongs to
 * `buildLiveDay`, which owns the whole ingest path including its error handling;
 * duplicating that here would give the app two WHOOP code paths that could
 * disagree about what a failure means.
 */
export async function refreshWearable(): Promise<RefreshResult> {
  const userId = await getUserId();

  const [conn] = await db
    .select()
    .from(wearableConnection)
    .where(
      and(
        eq(wearableConnection.userId, userId),
        eq(wearableConnection.provider, "whoop"),
      ),
    )
    .limit(1);

  if (!conn) return { ok: false, reason: "NOT_CONNECTED" };

  const now = Date.now();
  if (conn.lastSyncedAt) {
    const elapsed = now - conn.lastSyncedAt.getTime();
    if (elapsed < MANUAL_REFRESH_COOLDOWN_MS) {
      // Say how long, rather than a bare refusal. WHOOP's rate limit is the real
      // constraint and the user cannot see it, so the number has to come from us.
      return {
        ok: false,
        reason: "COOLDOWN",
        retryInSeconds: Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  await db
    .update(wearableConnection)
    .set({ lastSyncedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(wearableConnection.userId, userId),
        eq(wearableConnection.provider, "whoop"),
      ),
    );

  revalidatePath("/live");
  return { ok: true };
}
