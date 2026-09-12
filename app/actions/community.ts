"use server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkIn, friendship, user } from "@/lib/db/schema";

/**
 * There is no RLS on Neon, so every query below scopes by this id explicitly.
 * Throwing (rather than returning null) keeps callers from accidentally
 * treating an unauthenticated request as a valid one.
 */
async function getUserId(): Promise<string> {
  // Next 14.2: headers() is synchronous.
  const session = await await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * The ids of everyone the caller is *mutually* connected to.
 *
 * This is the single chokepoint for the founder's §8 ruling ("mutual accept
 * only"). Every friend-visible read goes through it, so there is one place to
 * audit rather than a status check duplicated at each call site and eventually
 * forgotten at one of them.
 *
 * `status === "accepted"` is required. A pending request must grant nothing —
 * otherwise the act of asking to see someone's data would be enough to see it.
 */
async function acceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
    })
    .from(friendship)
    .where(
      and(
        eq(friendship.status, "accepted"),
        or(eq(friendship.requesterId, userId), eq(friendship.addresseeId, userId)),
      ),
    );

  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

export type FriendCheckIn = {
  id: number;
  placeName: string;
  lat: number | null;
  lon: number | null;
  plannedFor: Date | null;
  createdAt: Date;
  friendName: string;
};

/**
 * Check-ins belonging to accepted friends that were explicitly shared.
 *
 * Three conditions have to hold at once, and all three are enforced here in SQL
 * rather than filtered in the component: the row is shared, the owner is a
 * mutual friend, and the owner is not the caller. Filtering in React would mean
 * the unshared rows still travelled to the client, where they are one `console
 * .log` or one future `map` away from being visible.
 *
 * The select list is deliberately narrow — place, time, and who. No note, and
 * the table holds no macros at all, so "place and time only" is a property of
 * the query and the schema together rather than a promise made in a comment.
 */
export async function getFriendCheckIns(): Promise<FriendCheckIn[]> {
  const userId = await getUserId();
  const friendIds = await acceptedFriendIds(userId);
  if (friendIds.length === 0) return [];

  return db
    .select({
      id: checkIn.id,
      placeName: checkIn.placeName,
      lat: checkIn.lat,
      lon: checkIn.lon,
      plannedFor: checkIn.plannedFor,
      createdAt: checkIn.createdAt,
      friendName: user.name,
    })
    .from(checkIn)
    .innerJoin(user, eq(user.id, checkIn.userId))
    .where(
      and(
        eq(checkIn.sharedWithFriends, true),
        inArray(checkIn.userId, friendIds),
      ),
    )
    .orderBy(desc(checkIn.createdAt))
    .limit(50);
}

export type OwnCheckIn = {
  id: number;
  placeName: string;
  lat: number | null;
  lon: number | null;
  note: string | null;
  plannedFor: Date | null;
  sharedWithFriends: boolean;
  createdAt: Date;
};

/** The caller's own check-ins, shared or not — it is their data either way. */
export async function getOwnCheckIns(): Promise<OwnCheckIn[]> {
  const userId = await getUserId();
  return db
    .select({
      id: checkIn.id,
      placeName: checkIn.placeName,
      lat: checkIn.lat,
      lon: checkIn.lon,
      note: checkIn.note,
      plannedFor: checkIn.plannedFor,
      sharedWithFriends: checkIn.sharedWithFriends,
      createdAt: checkIn.createdAt,
    })
    .from(checkIn)
    .where(eq(checkIn.userId, userId))
    .orderBy(desc(checkIn.createdAt))
    .limit(50);
}

/**
 * Parse a coordinate from form input, rejecting anything out of range.
 *
 * The bounds matter because these values are client-supplied. A latitude of 900
 * is not a location, and Leaflet given one silently pans to nowhere — so a
 * nonsense coordinate is stored as `null` (honestly absent) rather than as a
 * number that will later be drawn as if it were a place.
 */
function coordOrNull(raw: FormDataEntryValue | null, max: 90 | 180): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Latitude and longitude have different ranges; a shared ±180 check would let
  // an impossible latitude of 180 through.
  if (Math.abs(n) > max) return null;
  return n;
}

export type CheckInFormState = { error?: string; ok?: boolean };

/**
 * Record a place.
 *
 * `share` is read from the form as an explicit opt-in: an absent checkbox is
 * `null`, which becomes `false`. The default in the column is also `false`, so a
 * check-in has to be deliberately shared twice over — once by the schema and
 * once by the user — before anyone else can see it.
 */
export async function createCheckIn(
  _prev: CheckInFormState,
  form: FormData,
): Promise<CheckInFormState> {
  const userId = await getUserId();

  const placeName = String(form.get("placeName") ?? "").trim();
  if (!placeName) return { error: "A place needs a name." };
  if (placeName.length > 120) return { error: "That name is too long." };

  const note = String(form.get("note") ?? "").trim();
  const share = form.get("share") === "on";

  const rawPlanned = String(form.get("plannedFor") ?? "").trim();
  let plannedFor: Date | null = null;
  if (rawPlanned) {
    const parsed = new Date(rawPlanned);
    // An unparseable date becomes null rather than Invalid Date, which would
    // otherwise reach Postgres and fail the insert with a driver-level error.
    if (!Number.isNaN(parsed.getTime())) plannedFor = parsed;
  }

  /*
   * Coordinates come from the browser's geolocation API, and only when the user
   * pressed the button that asks for them. There is no geocoding of the typed
   * place name.
   *
   * That is a deliberate limit rather than a missing feature: guessing a
   * lat/lon from a name like "the noodle place" would put a pin somewhere the
   * user never was and present it with the same authority as a measured
   * position. §4.11 forbids exactly that — and the deleted community fixture,
   * which pinned invented data to real restaurant names, is what it looks like
   * when this rule is ignored. A place with no coordinates stays unpinned and
   * the map says how many are missing.
   */
  const lat = coordOrNull(form.get("lat"), 90);
  const lon = coordOrNull(form.get("lon"), 180);

  await db.insert(checkIn).values({
    userId,
    placeName,
    note: note || null,
    plannedFor,
    lat,
    lon,
    sharedWithFriends: share,
  });

  revalidatePath("/community");
  return { ok: true };
}

/** Flip sharing on an existing check-in, scoped so it must be the caller's own. */
export async function setCheckInShared(id: number, shared: boolean): Promise<void> {
  const userId = await getUserId();
  await db
    .update(checkIn)
    .set({ sharedWithFriends: shared })
    .where(and(eq(checkIn.id, id), eq(checkIn.userId, userId)));
  revalidatePath("/community");
}

export type FriendRow = {
  id: number;
  name: string;
  email: string;
  status: string;
  /** True when the caller received this request and has not answered it. */
  incoming: boolean;
};

/** Everyone connected to the caller, in any state, with direction preserved. */
export async function getFriends(): Promise<FriendRow[]> {
  const userId = await getUserId();

  const rows = await db
    .select({
      id: friendship.id,
      status: friendship.status,
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      requesterName: sql<string>`requester."name"`,
      requesterEmail: sql<string>`requester."email"`,
      addresseeName: sql<string>`addressee."name"`,
      addresseeEmail: sql<string>`addressee."email"`,
    })
    .from(friendship)
    .innerJoin(sql`"user" as requester`, sql`requester."id" = ${friendship.requesterId}`)
    .innerJoin(sql`"user" as addressee`, sql`addressee."id" = ${friendship.addresseeId}`)
    .where(or(eq(friendship.requesterId, userId), eq(friendship.addresseeId, userId)))
    .orderBy(desc(friendship.createdAt));

  return rows.map((r) => {
    const iAmRequester = r.requesterId === userId;
    return {
      id: r.id,
      name: iAmRequester ? r.addresseeName : r.requesterName,
      email: iAmRequester ? r.addresseeEmail : r.requesterEmail,
      status: r.status,
      incoming: !iAmRequester && r.status === "pending",
    };
  });
}

export type FriendFormState = { error?: string; ok?: string };

/**
 * Ask to connect, by email.
 *
 * Deliberately returns the same "request sent" result whether or not the address
 * belongs to a real account. Distinguishing the two would turn this form into an
 * oracle for "does this person use HealthOS", which is a membership disclosure
 * the addressee never agreed to.
 */
export async function requestFriend(
  _prev: FriendFormState,
  form: FormData,
): Promise<FriendFormState> {
  const userId = await getUserId();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "An email is needed." };

  /*
   * Deliberately identical whether or not the address belongs to a real account.
   * Saying "no such user" would turn this box into an email-enumeration oracle
   * for a health product, where merely confirming that someone has an account is
   * itself a disclosure.
   */
  const sent = { ok: "Request sent. They will see it next time they open HealthOS." };

  const target = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  const targetId = target[0]?.id;

  /*
   * A self-request gets a real error, not `sent`.
   *
   * These two cases were originally one branch, which meant typing your own
   * address returned "Request sent." while the action correctly wrote nothing —
   * the UI stating as fact something that had not happened. Browser testing
   * caught it; the database was right and the message was wrong.
   *
   * The enumeration argument does not apply here: the caller obviously knows
   * their own address already, so naming this case reveals nothing they could
   * not already confirm.
   */
  if (targetId === userId) return { error: "That is your own account." };
  if (!targetId) return sent;

  // The unique index on (LEAST, GREATEST) makes A→B and B→A the same pair, so a
  // duplicate request is a no-op rather than a second row or a 500.
  await db
    .insert(friendship)
    .values({ requesterId: userId, addresseeId: targetId })
    .onConflictDoNothing();

  revalidatePath("/community");
  return sent;
}

/**
 * Answer an incoming request.
 *
 * Scoped to `addresseeId = caller`, so only the person who received a request
 * can accept it. Without that clause a requester could accept their own request
 * and self-approve into someone else's graph, which would quietly reduce "mutual
 * accept" to "accept".
 */
export async function respondToFriend(id: number, accept: boolean): Promise<void> {
  const userId = await getUserId();
  await db
    .update(friendship)
    .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
    .where(and(eq(friendship.id, id), eq(friendship.addresseeId, userId)));
  revalidatePath("/community");
}
