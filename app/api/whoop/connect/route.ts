import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WhoopAuthError, whoopAuthorizeUrl } from "@/lib/whoop/client";
import { WHOOP_STATE_COOKIE } from "@/lib/whoop/oauth-state";

export const dynamic = "force-dynamic";

/**
 * Start the WHOOP OAuth flow.
 *
 * The `state` value is generated here, stored in an httpOnly cookie, and
 * compared in the callback. Without that comparison an attacker could feed the
 * callback their own authorization code and bind their WHOOP account to the
 * victim's session.
 */
export async function GET() {
  // Next 14.2: headers() and cookies() are synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", getOrigin()));
  }

  let authorizeUrl: string;
  try {
    const state = randomBytes(16).toString("hex"); // 32 chars; WHOOP requires >= 8
    authorizeUrl = whoopAuthorizeUrl(state);

    cookies().set(WHOOP_STATE_COOKIE, state, {
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
      new URL(`/connect/whoop?error=${encodeURIComponent(message)}`, getOrigin()),
    );
  }

  return NextResponse.redirect(authorizeUrl);
}

function getOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
