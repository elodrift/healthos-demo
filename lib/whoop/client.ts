import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wearableConnection } from "@/lib/db/schema";

/**
 * WHOOP v2 API client.
 *
 * Verified against developer.whoop.com (Feb 2026), not from memory. The two
 * facts that shape this whole file:
 *
 *  1. Refresh ROTATES. Exchanging a refresh token invalidates both the old
 *     access token and the old refresh token. The response's refresh_token is
 *     the only one that will work next time, so it must be persisted in the
 *     same operation that consumed the previous one. Lose that write and the
 *     user silently drops offline until they re-authorise.
 *  2. WHOOP reports energy in KILOJOULES (`kilojoule`), never kcal. Rendering
 *     that number next to a kcal target would overstate burn by ~4.2x.
 */

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API = "https://api.prod.whoop.com/developer";

/**
 * `offline` is the scope people forget. Without it WHOOP returns an access
 * token that dies in ~1 hour and NO refresh token, so background sync is
 * impossible and "connect once" becomes "reconnect hourly".
 */
export const WHOOP_SCOPES = [
  "offline",
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:workout",
  "read:profile",
] as const;

export const KJ_PER_KCAL = 4.184;

/** Convert WHOOP kilojoules to kcal. */
export function kjToKcal(kilojoule: number): number {
  return kilojoule / KJ_PER_KCAL;
}

export class WhoopAuthError extends Error {}
export class WhoopNotConnectedError extends Error {}

function credentials() {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new WhoopAuthError(
      "WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET are not set. Add them in project settings.",
    );
  }
  return { clientId, clientSecret };
}

/** The app's registered redirect URI, resolved per environment. */
export function whoopRedirectUri(): string {
  /*
   * On production the stable production domain wins over
   * WHOOP_REDIRECT_BASE_URL; everywhere else the env var still takes precedence.
   *
   * The env var used to win unconditionally, which is the wrong way round for the
   * one environment that matters. A single WHOOP_REDIRECT_BASE_URL applies to
   * every environment, so whatever value makes local or preview work — and in
   * this project it is currently a preview URL — would follow the code to
   * production and be sent as `redirect_uri` there. WHOOP compares that against
   * its registered URI and rejects the mismatch, so connecting fails on the
   * deployed app while working perfectly in preview. Worse, the deploy itself
   * looks entirely healthy: nothing throws until a user clicks Connect.
   *
   * Preferring VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV === "production"
   * makes production self-configuring and keeps the override useful for the
   * environments that genuinely need to point somewhere custom.
   */
  const productionDomain =
    process.env.VERCEL_ENV === "production" &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined;

  const base =
    productionDomain ??
    process.env.WHOOP_REDIRECT_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL);

  if (!base) {
    throw new WhoopAuthError("Cannot resolve a redirect URI for WHOOP.");
  }
  const withScheme = base.startsWith("http") ? base : `https://${base}`;

  // Tolerate WHOOP_REDIRECT_BASE_URL being set to the *full callback URL*
  // rather than the origin.
  //
  // This is not hypothetical tidiness: it happened during setup. WHOOP's
  // dashboard asks for the whole redirect URI, so that is the string in front of
  // whoever is configuring this, and pasting it here yields
  // ".../api/whoop/callback/api/whoop/callback" — which WHOOP rejects as a
  // redirect_uri mismatch, an error that says nothing about the real cause.
  // Since we always append the path ourselves, a supplied one is unambiguously
  // redundant and safe to strip.
  const origin = withScheme
    .replace(/\/+$/, "")
    .replace(/\/api\/whoop\/callback$/, "");

  return `${origin}/api/whoop/callback`;
}

/**
 * Build the consent URL.
 *
 * WHOOP requires `state` to be at least 8 characters and echoes it back; we
 * compare it in the callback to block CSRF.
 */
export function whoopAuthorizeUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: whoopRedirectUri(),
    response_type: "code",
    scope: WHOOP_SCOPES.join(" "),
    state,
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new WhoopAuthError(
      `WHOOP token request failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

/** Exchange the one-time authorization code for tokens. */
export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret } = credentials();
  return postToken({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: whoopRedirectUri(),
  });
}

/**
 * Persist a token set, replacing whatever was there.
 *
 * `refreshToken` is only overwritten when WHOOP actually returned a new one —
 * a refresh response that omits it must not blank out the stored token.
 */
export async function saveWhoopTokens(
  userId: string,
  tokens: TokenResponse,
  providerUserId?: string,
) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const existing = await db
    .select({ id: wearableConnection.id })
    .from(wearableConnection)
    .where(
      and(
        eq(wearableConnection.userId, userId),
        eq(wearableConnection.provider, "whoop"),
      ),
    )
    .limit(1);

  const values = {
    accessToken: tokens.access_token,
    expiresAt,
    scope: tokens.scope ?? WHOOP_SCOPES.join(" "),
    syncError: null as string | null,
    updatedAt: new Date(),
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    ...(providerUserId ? { providerUserId } : {}),
  };

  if (existing[0]) {
    await db
      .update(wearableConnection)
      .set(values)
      .where(eq(wearableConnection.id, existing[0].id));
  } else {
    await db.insert(wearableConnection).values({
      userId,
      provider: "whoop",
      ...values,
      refreshToken: tokens.refresh_token ?? null,
      providerUserId: providerUserId ?? null,
    });
  }
}

/**
 * Return a usable access token, refreshing when it is close to expiry.
 *
 * The 60s skew avoids handing back a token that expires mid-request. On a
 * failed refresh the error is stored on the row so the UI can explain the real
 * reason rather than pretending the device was never connected.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const rows = await db
    .select()
    .from(wearableConnection)
    .where(
      and(
        eq(wearableConnection.userId, userId),
        eq(wearableConnection.provider, "whoop"),
      ),
    )
    .limit(1);

  const conn = rows[0];
  if (!conn) throw new WhoopNotConnectedError("WHOOP is not connected.");

  const stillValid =
    conn.expiresAt && conn.expiresAt.getTime() - 60_000 > Date.now();
  if (stillValid) return conn.accessToken;

  if (!conn.refreshToken) {
    throw new WhoopAuthError(
      "WHOOP access token expired and no refresh token is stored. Reconnect with the offline scope.",
    );
  }

  const { clientId, clientSecret } = credentials();
  try {
    const refreshed = await postToken({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: "offline",
    });
    // Must persist immediately: the token just used is now dead.
    await saveWhoopTokens(userId, refreshed);
    return refreshed.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(wearableConnection)
      .set({ syncError: message, updatedAt: new Date() })
      .where(eq(wearableConnection.id, conn.id));
    throw err;
  }
}

/**
 * Disconnect WHOOP: revoke the grant at WHOOP, then delete our stored tokens.
 *
 * Two things make this more than a row delete.
 *
 * First, deleting our row alone would leave the grant **live on WHOOP's side** —
 * the app would still be listed as authorised in the user's WHOOP account, and
 * the tokens would keep working until they expired. So we call WHOOP's
 * revocation endpoint (`DELETE /v2/user/access`, which is WHOOP's own scheme
 * rather than RFC 7009, and answers 204) before deleting anything locally.
 *
 * Second, the local delete happens **whether or not** the remote revoke
 * succeeds. The user asked us to stop holding their credentials; continuing to
 * hold them because a network call failed would be the wrong way round. But the
 * failure is returned rather than swallowed, because "disconnected" and
 * "disconnected here, still authorised at WHOOP" are different states and the
 * user needs to know which one they are in so they can finish the job in WHOOP's
 * own settings.
 */
export async function revokeWhoopAccess(
  userId: string,
): Promise<{ localDeleted: boolean; remoteRevoked: boolean; reason?: string }> {
  let remoteRevoked = false;
  let reason: string | undefined;

  try {
    // Deliberately uses getValidAccessToken: revoking needs a *live* token, so
    // an expired one is refreshed first. Without this, a user returning after a
    // day would silently fail to revoke at WHOOP.
    const token = await getValidAccessToken(userId);
    const res = await fetch(`${WHOOP_API}/v2/user/access`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (res.status === 204 || res.ok) {
      remoteRevoked = true;
    } else if (res.status === 401 || res.status === 403) {
      // The token is already rejected, so there is nothing left to revoke. Not
      // an error worth alarming the user about, but not a confirmed revoke
      // either — say so rather than claiming success.
      reason = "WHOOP had already invalidated this authorisation.";
    } else {
      const detail = await res.text().catch(() => "");
      reason = `WHOOP returned ${res.status}. ${detail.slice(0, 140)}`.trim();
    }
  } catch (err) {
    if (err instanceof WhoopNotConnectedError) {
      // Nothing stored, so nothing to revoke or delete.
      return { localDeleted: false, remoteRevoked: false };
    }
    reason = err instanceof Error ? err.message : String(err);
  }

  const deleted = await db
    .delete(wearableConnection)
    .where(
      and(
        eq(wearableConnection.userId, userId),
        eq(wearableConnection.provider, "whoop"),
      ),
    )
    .returning({ id: wearableConnection.id });

  return { localDeleted: deleted.length > 0, remoteRevoked, reason };
}

async function whoopGet<T>(
  userId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const token = await getValidAccessToken(userId);
  const url = new URL(`${WHOOP_API}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new Error("WHOOP rate limit reached. Try again shortly.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WHOOP ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------------------
 * Response types, transcribed from the published OpenAPI samples.
 * `score_state` matters: PENDING_SCORE and UNSCORABLE records carry no score,
 * so `score` is optional and every read of it must be guarded.
 * ------------------------------------------------------------------------- */

type ScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE";

export type WhoopRecovery = {
  cycle_id: number;
  sleep_id: string;
  created_at: string;
  score_state: ScoreState;
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
  };
};

export type WhoopSleep = {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: ScoreState;
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
    };
    sleep_performance_percentage: number | null;
  };
};

export type WhoopCycle = {
  id: number;
  start: string;
  end: string | null;
  score_state: ScoreState;
  score?: { strain: number; kilojoule: number; average_heart_rate: number };
};

type Paged<T> = { records: T[]; next_token?: string };

/** `limit` is capped at 25 by the API; larger values are rejected. */
export async function fetchRecovery(userId: string, limit = 7) {
  return whoopGet<Paged<WhoopRecovery>>(userId, "/v2/recovery", {
    limit: String(Math.min(limit, 25)),
  });
}

export async function fetchSleep(userId: string, limit = 7) {
  return whoopGet<Paged<WhoopSleep>>(userId, "/v2/activity/sleep", {
    limit: String(Math.min(limit, 25)),
  });
}

export async function fetchCycles(userId: string, limit = 7) {
  return whoopGet<Paged<WhoopCycle>>(userId, "/v2/cycle", {
    limit: String(Math.min(limit, 25)),
  });
}

export async function fetchProfile(userId: string) {
  return whoopGet<{
    user_id: number;
    email: string;
    first_name: string;
    last_name: string;
  }>(userId, "/v2/user/profile/basic");
}

/** Actual asleep time: in-bed minus awake, not in-bed alone. */
export function sleepMinutes(sleep: WhoopSleep): number | null {
  const s = sleep.score?.stage_summary;
  if (!s) return null;
  return Math.round(
    (s.total_in_bed_time_milli - s.total_awake_time_milli) / 60000,
  );
}
