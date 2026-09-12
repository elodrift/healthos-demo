import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WhoopAuthError, whoopAuthorizeUrl, whoopOriginProblem } from "@/lib/whoop/client";
import { WHOOP_STATE_COOKIE } from "@/lib/whoop/oauth-state";

// Removed for cacheComponents compatibility

/**
 * Start the WHOOP OAuth flow.
 *
 * The `state` value is generated here, stored in an httpOnly cookie, and
 * compared in the callback. Without that comparison an attacker could feed the
 * callback their own authorization code and bind their WHOOP account to the
 * victim's session.
 */
export async function GET() {
  // Next 14.2: (await headers()) and cookies() are synchronous.
  const session = await await auth.api.getSession({ headers: await (await headers()) });
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", await getOrigin()));
  }

  /*
    Refuse the round trip when this origin cannot receive the callback.

    WHOOP returns the user to the ONE redirect_uri registered on the app
    (WHOOP_REDIRECT_BASE_URL). If they started here on a different host — the v0
    preview, a branch deployment, localhost — the callback lands on the
    registered host instead, which holds neither `whoop_oauth_state` nor their
    session cookie. The callback then correctly reports "the authorization state
    did not match", which reads as tampering when it is really just a hostname.

    No cookie attribute can fix this: SameSite/Secure/Partitioned govern *when* a
    cookie is sent back to its own origin, never which other origin may read it.
    So this is a genuine precondition, and failing here — before the user hands
    credentials to WHOOP and comes back to a dead end — is the honest place to
    stop. Checked at request time rather than trusted, because the deployed host
    and the registered host drift apart routinely.
  */
  const runningOrigin = await getOrigin();
  const originProblem = whoopOriginProblem(runningOrigin);
  if (originProblem) {
    return NextResponse.redirect(
      new URL(`/connect/whoop?error=${encodeURIComponent(originProblem)}`, runningOrigin),
    );
  }

  let authorizeUrl: string;
  try {
    const state = randomBytes(16).toString("hex"); // 32 chars; WHOOP requires >= 8
    authorizeUrl = whoopAuthorizeUrl(state);

    (await cookies()).set(WHOOP_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      // `lax` still sends the cookie on the top-level GET redirect back from
      // WHOOP. `strict` would drop it and every callback would fail.
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
  } catch (err) {
    // Missing client credentials is the common case. Surface it as a readable
    // page rather than a 500 with no explanation.
    const message =
      err instanceof WhoopAuthError
        ? err.message
        : "Could not build the WHOOP authorization URL.";
    return NextResponse.redirect(
      new URL(`/connect/whoop?error=${encodeURIComponent(message)}`, await getOrigin()),
    );
  }

  return NextResponse.redirect(authorizeUrl);
}

async function getOrigin(): Promise<string> {
  const h = (await headers());
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
