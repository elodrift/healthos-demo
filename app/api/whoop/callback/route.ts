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
  whoopRedirectOrigin,
} from "@/lib/whoop/client";
import { publicOrigin } from "@/lib/env";
import { log } from "@/lib/log";
import { WHOOP_STATE_COOKIE } from "@/lib/whoop/oauth-state";

// Removed for cacheComponents compatibility

/**
 * WHOOP redirects here after the user accepts or denies consent.
 *
 * This is the URL registered as "Redirect #1" in the WHOOP developer app. It
 * must be the published origin, not the v0 preview origin — the preview
 * answers 302 to an unauthorized page, which would swallow the `code`.
 */
export async function GET(request: NextRequest) {
  // The redirect must land on the origin WHOOP was registered against, or the
  // session/state cookies set there won't be present on return — see
  // whoopRedirectOrigin()'s own comment. publicOrigin() is the fallback for
  // when WHOOP credentials aren't configured at all, which is a different,
  // already-reported failure and not this route's to diagnose.
  let origin: string;
  try {
    origin = whoopRedirectOrigin();
  } catch {
    origin = publicOrigin();
  }
  const params = request.nextUrl.searchParams;
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/connect/whoop?error=${encodeURIComponent(reason)}`, origin),
    );

  // Next 14.2: (await cookies()) and (await headers()) are synchronous.
  const jar = (await cookies());
  const expectedState = jar.get(WHOOP_STATE_COOKIE)?.value;
  // One-shot value: clear it on every path so a leaked state cannot be replayed.
  jar.delete(WHOOP_STATE_COOKIE);

  const session = await await auth.api.getSession({ headers: await (await headers()) });
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
    /*
      The upstream message is logged, not reflected. It used to be interpolated
      straight into the redirect URL and rendered on /connect/whoop, which put
      whatever WHOOP's token endpoint returned — upstream error bodies, request
      detail, anything a failing exchange happens to include — onto a page in the
      user's browser. The user gets a stable sentence; the detail goes to the log
      where it is actually useful.
    */
    log.error("whoop.callback_failed", { userId: session.user.id }, err);
    return fail("The WHOOP connection could not be completed. Try again.");
  }
}

/** Constant-time compare that tolerates unequal lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/*
  `getOrigin()` used to live here and built the redirect target from the
  `X-Forwarded-Host` / `Host` request headers. That is an open redirect: both are
  attacker-supplied on any request that does not pass through a proxy which
  overwrites them, so a crafted `Host` would send this route's redirect — arriving
  immediately after a successful WHOOP token exchange — to another origin.

  It is now `whoopRedirectOrigin()` in lib/whoop/client.ts — the origin half of
  the redirect URI actually registered with WHOOP — falling back to
  `publicOrigin()` in lib/env.ts (BETTER_AUTH_URL or the Vercel-injected project
  URL) only when that throws, i.e. when WHOOP credentials aren't configured at
  all. A redirect target must come from configuration, never from the request.
  Preferring whoopRedirectOrigin() over publicOrigin() matters here specifically:
  the state cookie and session cookie are both scoped to the origin that set
  them, so if this route redirected via a different-but-valid configured origin
  than the one WHOOP actually returns the user to, the callback would arrive
  holding neither cookie.
*/
