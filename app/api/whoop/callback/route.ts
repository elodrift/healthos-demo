import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { wearableConnection } from "@/lib/db/schema";
import {
  exchangeCodeForTokens,
  fetchProfile,
  saveWhoopTokens,
} from "@/lib/whoop/client";
import { WHOOP_STATE_COOKIE } from "../connect/route";

export const dynamic = "force-dynamic";

/**
 * WHOOP redirects here after the user accepts or denies consent.
 *
 * This is the URL registered as "Redirect #1" in the WHOOP developer app. It
 * must be the published origin, not the v0 preview origin — the preview
 * answers 302 to an unauthorized page, which would swallow the `code`.
 */
export async function GET(request: NextRequest) {
  const origin = getOrigin();
  const params = request.nextUrl.searchParams;
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/connect/whoop?error=${encodeURIComponent(reason)}`, origin),
    );

  // Next 14.2: cookies() and headers() are synchronous.
  const jar = cookies();
  const expectedState = jar.get(WHOOP_STATE_COOKIE)?.value;
  // One-shot value: clear it on every path so a leaked state cannot be replayed.
  jar.delete(WHOOP_STATE_COOKIE);

  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) return NextResponse.redirect(new URL("/sign-in", origin));

  // WHOOP sends ?error=access_denied when the user declines. That is a normal
  // outcome, not a bug, so it gets a plain explanation.
  const oauthError = params.get("error");
  if (oauthError) {
    return fail(
      oauthError === "access_denied"
        ? "You declined access, so nothing was connected."
        : `WHOOP returned an error: ${oauthError}`,
    );
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("WHOOP did not return an authorization code.");
  if (!expectedState || !safeEqual(state, expectedState)) {
    return fail(
      "The authorization state did not match. Start the connection again.",
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // `offline` is what makes WHOOP issue a refresh token. Without one the
    // connection dies in about an hour, so refusing here is more honest than
    // storing a token that silently stops working.
    if (!tokens.refresh_token) {
      return fail(
        "WHOOP did not return a refresh token, so the connection would expire " +
          "within the hour. Ensure the app requests the 'offline' scope.",
      );
    }

    await saveWhoopTokens(session.user.id, tokens);

    // Best-effort: the connection is already usable without the profile, so a
    // failure here must not undo a successful token exchange.
    try {
      const profile = await fetchProfile(session.user.id);
      await db
        .update(wearableConnection)
        .set({ providerUserId: String(profile.user_id), updatedAt: new Date() })
        .where(
          and(
            eq(wearableConnection.userId, session.user.id),
            eq(wearableConnection.provider, "whoop"),
          ),
        );
    } catch {
      // Leave providerUserId null; sync does not depend on it.
    }

    return NextResponse.redirect(new URL("/connect/whoop?connected=1", origin));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unknown error.");
  }
}

/** Constant-time compare that tolerates unequal lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function getOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
