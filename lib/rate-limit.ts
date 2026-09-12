/**
 * Fixed-window rate limiting for public endpoints.
 *
 * Generalised from lib/agent/rate-limit.ts, which throttled the chat route only.
 * Three endpoints needed it and did not have it:
 *
 *  - /api/barcode calls Open Food Facts, a donation-funded community service
 *    that allows roughly 15 product reads per minute *per IP* and reserves the
 *    right to ban rather than 429. Vercel's egress IPs are shared, so the
 *    consequence of exceeding it is not confined to this app.
 *  - /api/meal-photo/upload calls a paid vision model with maxDuration 45. An
 *    unmetered loop there is a bill and a queue of blocked invocations.
 *  - The mutating server actions write to the database on every call.
 *
 * ## The honest limitation
 *
 * This is in-memory. On Vercel that means per-instance and reset on redeploy:
 * with N warm instances the effective ceiling is N x `max`, and a distributed
 * attacker spread across instances is barely slowed. It stops the realistic
 * failure — one client, one retry loop, one instance — and nothing more.
 *
 * `@upstash/ratelimit` backed by Redis is the upgrade, and the call signature
 * here is deliberately the same shape so swapping it is a change to this file
 * only. Do that before this is exposed to untrusted traffic at volume.
 */

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the next request would be allowed. Only set when !ok. */
  retryAfter?: number;
  /** Requests still available in the current window. */
  remaining: number;
};

export type Bucket = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests permitted per window. */
  max: number;
};

/** Named buckets, so a limit is a stated policy rather than a magic number. */
export const BUCKETS = {
  /** Model-backed chat. Matches the previous agent-only limit exactly. */
  chat: { windowMs: 60_000, max: 12 },
  /**
   * Barcode lookups. Deliberately below Open Food Facts' ~15/min per-IP budget
   * so a single user cannot consume the whole shared allowance alone.
   */
  barcode: { windowMs: 60_000, max: 10 },
  /** Photo upload: strip + private store + a vision call. Expensive and slow. */
  photoUpload: { windowMs: 60_000, max: 6 },
  /** Ordinary authenticated writes. Generous; this is a runaway-client guard. */
  write: { windowMs: 60_000, max: 30 },
  /**
   * CSP violation reports. Unauthenticated by necessity — the browser sends
   * these without credentials — so this is the only guard between the endpoint
   * and an unmetered public write. Generous because a real page can legitimately
   * fire several distinct violations in a burst on load.
   */
  cspReport: { windowMs: 60_000, max: 30 },
} as const satisfies Record<string, Bucket>;

export type BucketName = keyof typeof BUCKETS;

/** bucket -> key -> timestamps inside the current window. */
const hits = new Map<string, Map<string, number[]>>();

export function checkRateLimit(bucketName: BucketName, key: string): RateLimitResult {
  const bucket = BUCKETS[bucketName];
  const now = Date.now();

  let table = hits.get(bucketName);
  if (!table) {
    table = new Map();
    hits.set(bucketName, table);
  }

  const recent = (table.get(key) ?? []).filter((t) => now - t < bucket.windowMs);

  if (recent.length >= bucket.max) {
    const oldest = Math.min(...recent);
    table.set(key, recent);
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.windowMs - (now - oldest)) / 1000)),
      remaining: 0,
    };
  }

  recent.push(now);
  table.set(key, recent);

  // Opportunistic sweep so idle keys do not accumulate in a long-lived instance.
  if (table.size > 500) {
    for (const [k, times] of table) {
      if (times.every((t) => now - t >= bucket.windowMs)) table.delete(k);
    }
  }

  return { ok: true, remaining: bucket.max - recent.length };
}

/**
 * A 429 with the headers a well-behaved client actually reads.
 *
 * `Retry-After` is what makes a retry loop back off instead of hammering, which
 * is the difference between a limiter that protects the upstream and one that
 * just moves the load around.
 */
export function tooManyRequests(message: string, retryAfter: number | undefined): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter ?? 60),
      "Cache-Control": "no-store",
    },
  });
}
