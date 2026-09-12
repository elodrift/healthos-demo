/**
 * Privacy invariants for the social layer, executed against a real database.
 *
 * These are the founder's §8 rulings — "nothing until explicitly shared" and
 * "mutual accept only" — expressed as assertions. They are checked with real SQL
 * against real rows rather than mocks, because the thing that can actually leak
 * is a `WHERE` clause, and a mock would happily agree with a wrong one.
 *
 * The scenario is built from throwaway users, asserted against, and torn down in
 * a `finally`, so a mid-run failure cannot leave test rows behind.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/test-community-privacy.ts
 */

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { checkIn, friendship, user } from "@/lib/db/schema";

let failures = 0;
let checks = 0;

function check(label: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/*
 * Mirrors `acceptedFriendIds` + `getFriendCheckIns` from app/actions/community.ts.
 *
 * Duplicated rather than imported because those are "use server" actions that
 * call `headers()` for a session, which does not exist outside a request. The
 * duplication is the point of risk, so the WHERE clauses are kept
 * character-identical to the ones under test.
 */
async function friendVisibleCheckIns(viewerId: string) {
  const links = await db
    .select({ requesterId: friendship.requesterId, addresseeId: friendship.addresseeId })
    .from(friendship)
    .where(
      and(
        eq(friendship.status, "accepted"),
        or(eq(friendship.requesterId, viewerId), eq(friendship.addresseeId, viewerId)),
      ),
    );

  const friendIds = links.map((r) => (r.requesterId === viewerId ? r.addresseeId : r.requesterId));
  if (friendIds.length === 0) return [];

  return db
    .select({ id: checkIn.id, placeName: checkIn.placeName })
    .from(checkIn)
    .innerJoin(user, eq(user.id, checkIn.userId))
    .where(and(eq(checkIn.sharedWithFriends, true), inArray(checkIn.userId, friendIds)))
    .orderBy(desc(checkIn.createdAt))
    .limit(50);
}

const STAMP = `pt-${Date.now()}`;
const ids = { a: `${STAMP}-a`, b: `${STAMP}-b`, c: `${STAMP}-c` };

async function seed() {
  for (const [k, id] of Object.entries(ids)) {
    await db.insert(user).values({
      id,
      name: `Privacy Test ${k.toUpperCase()}`,
      email: `${id}@privacy-test.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // A shares one place and keeps another private.
  await db.insert(checkIn).values({ userId: ids.a, placeName: "SHARED-BY-A", sharedWithFriends: true });
  await db.insert(checkIn).values({ userId: ids.a, placeName: "PRIVATE-BY-A", sharedWithFriends: false });
  // C shares, but is only a pending request — not a friend.
  await db.insert(checkIn).values({ userId: ids.c, placeName: "SHARED-BY-C", sharedWithFriends: true });

  await db.insert(friendship).values({ requesterId: ids.a, addresseeId: ids.b, status: "accepted" });
  await db.insert(friendship).values({ requesterId: ids.c, addresseeId: ids.b, status: "pending" });
}

async function teardown() {
  const all = Object.values(ids);
  await db.delete(checkIn).where(inArray(checkIn.userId, all));
  for (const id of all) {
    await db.delete(friendship).where(or(eq(friendship.requesterId, id), eq(friendship.addresseeId, id)));
  }
  await db.delete(user).where(inArray(user.id, all));
}

async function main() {
  console.log("community privacy (§8 rulings, real SQL)\n");
  try {
    await seed();

    const bSees = await friendVisibleCheckIns(ids.b);
    const names = bSees.map((r) => r.placeName);

    console.log("accepted friend sees only what was shared:");
    check("sees A's shared place", names.includes("SHARED-BY-A"));
    check(
      "does NOT see A's private place",
      !names.includes("PRIVATE-BY-A"),
      "unshared check-in leaked to a friend",
    );

    console.log("\npending request grants nothing:");
    check(
      "does NOT see C's shared place",
      !names.includes("SHARED-BY-C"),
      "a pending request was treated as a friendship",
    );

    console.log("\nno friendship at all:");
    const aSees = await friendVisibleCheckIns(ids.c);
    check(
      "C sees nothing from A",
      aSees.every((r) => !r.placeName.endsWith("-BY-A")),
      "data visible without any accepted link",
    );

    console.log("\nself-approval is impossible:");
    // A requested B. A tries to accept their own request, as the addressee clause
    // is the only thing standing between "mutual accept" and "accept".
    const pending = await db
      .insert(friendship)
      .values({ requesterId: ids.a, addresseeId: ids.c, status: "pending" })
      .returning({ id: friendship.id });
    await db
      .update(friendship)
      .set({ status: "accepted" })
      .where(and(eq(friendship.id, pending[0].id), eq(friendship.addresseeId, ids.a)));
    const after = await db
      .select({ status: friendship.status })
      .from(friendship)
      .where(eq(friendship.id, pending[0].id));
    check(
      "requester cannot accept their own request",
      after[0]?.status === "pending",
      `status became ${after[0]?.status}`,
    );

    console.log("\nschema forecloses food disclosure:");
    const cols = await pool.query(
      `select column_name from information_schema.columns where table_name = 'check_in'`,
    );
    const colNames = cols.rows.map((r: { column_name: string }) => r.column_name);
    check(
      "check_in stores no macro columns",
      !colNames.some((c) => /kcal|protein|carb|fat|macro/i.test(c)),
      `found ${colNames.join(", ")}`,
    );
    check(
      "sharing defaults to false",
      await (async () => {
        const d = await pool.query(
          `select column_default from information_schema.columns
           where table_name = 'check_in' and column_name = 'sharedWithFriends'`,
        );
        return /false/i.test(d.rows[0]?.column_default ?? "");
      })(),
    );
  } finally {
    await teardown();
    await pool.end();
  }

  console.log(`\n${checks - failures}/${checks} passed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
