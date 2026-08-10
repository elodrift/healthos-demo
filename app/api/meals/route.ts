/**
 * Log a confirmed meal, and read back today's meals.
 *
 * Recognition proposes, this route records. The split matters: a number only
 * reaches the database after a person has looked at it, so `estimated` and
 * `confidence` describe what the *user* accepted rather than what a model
 * guessed unsupervised.
 *
 * Every query is scoped to the session user. Neon has no RLS, so ownership is
 * enforced here on every read and write — there is no filter-free path to this
 * table.
 */

import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mealLog } from "@/lib/db/schema";
import { instantFromWallClock, localDay } from "@/lib/live/local-day";
import { mealPhotoPrefix } from "@/lib/photo/photo-path";

export const dynamic = "force-dynamic";

const Body = z.object({
  description: z.string().min(1).max(200),
  kcal: z.number().int().min(0).max(2500),
  proteinG: z.number().int().min(0).max(250),
  carbG: z.number().int().min(0).max(400),
  fatG: z.number().int().min(0).max(200),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  source: z.enum(["manual", "photo", "barcode"]),
  /**
   * Set only by the barcode flow, and only when the user weighed the portion.
   *
   * A scanned label makes the *composition* measured, but the weight is still
   * whatever the person put on the plate. So this is not "did you scan a
   * barcode" — it is "is the quantity known", which is the only reading that
   * makes `estimated: false` an honest claim downstream.
   */
  weighed: z.boolean().optional(),
  /** Blob pathname from the upload route. Optional: meals can be typed in. */
  photoPathname: z.string().max(300).optional(),
  /**
   * IANA zone from the browser. The day a meal belongs to is the user's local
   * day — deriving it from the server clock would file a late dinner in Bangkok
   * under tomorrow.
   */
  timeZone: z.string().min(1).max(60),
  /**
   * The photo's EXIF capture time as a naive wall clock ("YYYY-MM-DDTHH:MM"),
   * forwarded from the upload route.
   *
   * No zone and no "Z" by design: EXIF records the wall clock the camera saw
   * and nothing about where it was. It is read in `timeZone` below, which is an
   * assumption the UI states rather than hides.
   *
   * When present this is the meal's real time, and it beats the server clock —
   * a photo reviewed at 23:42 belongs to the brunch it shows, not to midnight.
   */
  capturedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "That meal could not be read." }, { status: 400 });
  }

  // A photo may only be attached if it lives under this user's own prefix.
  // Without this check a caller could staple someone else's photo to their meal
  // and then read it back through the delivery route, which trusts ownership.
  if (body.photoPathname && !body.photoPathname.startsWith(mealPhotoPrefix(session.user.id))) {
    return NextResponse.json({ error: "That photo does not belong to this account." }, { status: 403 });
  }

  const now = new Date();

  /*
    When the meal actually happened.

    Previously this was always `now`, i.e. upload time — so a photo taken at
    brunch and uploaded that night was filed at midnight, and the planner's slot
    reasoning ran against a day that never happened. A photo's capture time is
    the one thing about it that is measured rather than inferred, so it wins
    when we have it.

    Guard rails, because EXIF is user-controlled input:
      - A capture time in the future is impossible; fall back rather than
        create a meal the day has not reached yet.
      - Anything older than 30 days is almost certainly a saved or forwarded
        image, not a meal being logged now. Filing it silently would move
        totals on a day the user is no longer looking at.
    In both cases we fall back to now and report which clock was used, so the
    caller can say so instead of implying a precision it does not have.
  */
  const captured = body.capturedAt ? instantFromWallClock(body.capturedAt, body.timeZone) : null;

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const usable =
    captured !== null && captured.getTime() <= now.getTime() && now.getTime() - captured.getTime() <= THIRTY_DAYS_MS;

  const eatenAt = usable ? (captured as Date) : now;
  const timeBasis: "photo-capture" | "upload" = usable ? "photo-capture" : "upload";

  const day = localDay(eatenAt, body.timeZone);
  if (!day) return NextResponse.json({ error: "Unrecognised time zone." }, { status: 400 });

  const [row] = await db
    .insert(mealLog)
    .values({
      userId: session.user.id,
      day,
      /*
        Explicit rather than relying on the column default, which is now() and
        would reintroduce upload time for exactly the case this fixes.
      */
      loggedAt: eatenAt,
      description: body.description,
      kcal: body.kcal,
      proteinG: body.proteinG,
      carbG: body.carbG,
      fatG: body.fatG,
      confidence: body.confidence,
      /*
        Almost always true. Even a hand-typed meal is an estimate unless it was
        weighed, and the app does not pretend otherwise.

        The single exception is a scanned label with a weighed portion: the
        composition comes off the manufacturer's packet and the quantity off a
        scale, so nothing about the figure was inferred. Both halves are
        required — a scan with a guessed portion stays an estimate, because the
        macros are only as measured as the grams they were scaled from.

        This flag is load-bearing: it feeds `anyEstimated` in the agent snapshot
        and decides whether the planner's trace calls the day's intake MEASURED
        or ASSUMED. Setting it on a scan alone would launder a guessed portion
        into a measurement, which is the one thing this app must not do.
      */
      estimated: !(body.source === "barcode" && body.weighed === true),
      source: body.source,
      photoPathname: body.photoPathname ?? null,
    })
    .returning({ id: mealLog.id });

  /*
    `timeBasis` tells the caller which clock was used. Without it the UI would
    have to guess, and a component that guesses is a component that eventually
    asserts something false — the failure mode this codebase keeps hitting.
  */
  return NextResponse.json({ id: row.id, day, timeBasis });
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const timeZone = request.nextUrl.searchParams.get("tz") ?? "UTC";
  const day = localDay(new Date(), timeZone);
  if (!day) return NextResponse.json({ error: "Unrecognised time zone." }, { status: 400 });

  const meals = await db
    .select()
    .from(mealLog)
    .where(and(eq(mealLog.userId, session.user.id), eq(mealLog.day, day)))
    .orderBy(desc(mealLog.loggedAt));

  return NextResponse.json({ day, meals });
}
