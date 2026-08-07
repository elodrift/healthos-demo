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
import { localDay } from "@/lib/live/local-day";
import { mealPhotoPrefix } from "@/lib/photo/photo-path";

export const dynamic = "force-dynamic";

const Body = z.object({
  description: z.string().min(1).max(200),
  kcal: z.number().int().min(0).max(2500),
  proteinG: z.number().int().min(0).max(250),
  carbG: z.number().int().min(0).max(400),
  fatG: z.number().int().min(0).max(200),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  source: z.enum(["manual", "photo"]),
  /** Blob pathname from the upload route. Optional: meals can be typed in. */
  photoPathname: z.string().max(300).optional(),
  /**
   * IANA zone from the browser. The day a meal belongs to is the user's local
   * day — deriving it from the server clock would file a late dinner in Bangkok
   * under tomorrow.
   */
  timeZone: z.string().min(1).max(60),
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

  const day = localDay(new Date(), body.timeZone);
  if (!day) return NextResponse.json({ error: "Unrecognised time zone." }, { status: 400 });

  const [row] = await db
    .insert(mealLog)
    .values({
      userId: session.user.id,
      day,
      description: body.description,
      kcal: body.kcal,
      proteinG: body.proteinG,
      carbG: body.carbG,
      fatG: body.fatG,
      confidence: body.confidence,
      // Always true. Even a hand-typed meal is an estimate unless it was
      // weighed, and the app does not pretend otherwise.
      estimated: true,
      source: body.source,
      photoPathname: body.photoPathname ?? null,
    })
    .returning({ id: mealLog.id });

  return NextResponse.json({ id: row.id, day });
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
