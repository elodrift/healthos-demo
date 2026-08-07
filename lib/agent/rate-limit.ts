/**
 * Per-user throttle for model-backed endpoints.
 *
 * The deleted chat route had no auth and no ceiling, so a single caller in a loop
 * could drain the AI Gateway quota that food recognition depends on. Requiring a
 * session fixes the anonymous case; this fixes the authenticated one, where a
 * runaway client retry is a much likelier cause than malice.
 *
 * In-memory on purpose. It resets on redeploy and is per-instance rather than
 * global, which is genuinely weaker than a shared counter — but it needs no new
 * infrastructure and stops the realistic failure (one client, many requests,
 * one instance). Upstash Redis is the upgrade if this ever needs to hold across
 * instances; the call signature here would not change.
 */

const WINDOW_MS = 60_000;
const MAX_IN_WINDOW = 12;

/** userId -> timestamps within the current window. */
const hits = new Map<string, number[]>();

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the next request would be allowed. Only set when !ok. */
  retryAfter?: number;
};

export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_IN_WINDOW) {
    const oldest = Math.min(...recent);
    hits.set(userId, recent);
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }

  recent.push(now);
  hits.set(userId, recent);

  // Opportunistic sweep so idle users do not accumulate forever in a long-lived
  // instance. Cheap because it only runs when the map is already large.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }

  return { ok: true };
}
