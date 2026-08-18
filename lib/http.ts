import { findNakedNumbers, formatNakedNumbers } from "@/lib/provenance/naked-numbers";

/**
 * JSON responses that are safe to send from an authenticated endpoint.
 *
 * `export const dynamic = "force-dynamic"` controls Next's own caches. It does
 * not set a `Cache-Control` header, so a response carrying one user's meal log
 * left this app with no instruction about who may store it — and the default
 * behaviour of an intermediate proxy given no instruction is not something to
 * rely on for health data.
 *
 * `private, no-store` says: do not keep this anywhere, not even in the browser's
 * disk cache. For a per-user health record that is the correct default, and the
 * cost is a header.
 */
export function jsonPrivate(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "private, no-store");
  // Belt and braces: a JSON body should never be sniffed into something executable.
  headers.set("X-Content-Type-Options", "nosniff");

  /*
   * Dev-only provenance check.
   *
   * Every payload this app sends passes through here, which makes it the one
   * place a structural rule can be applied to all of them at once: a numeric
   * nutrition field must sit beside something saying where it came from.
   *
   * Three deliberate constraints:
   *  - development only, so production pays nothing and cannot 500 over a warning;
   *  - it WARNS, never throws — a guard that can break a user's meal log is worse
   *    than the fake precision it is looking for. CI is where this is fatal
   *    (`npm run test:provenance`), because that is where breaking the build is free;
   *  - wrapped in try/catch, because a serialisation guard that itself throws on a
   *    cyclic or exotic body would take down the very response it was auditing.
   */
  if (process.env.NODE_ENV === "development") {
    try {
      const naked = findNakedNumbers(body);
      if (naked.length > 0) {
        console.warn(
          `[provenance] ${naked.length} numeric nutrition field(s) sent without provenance:\n` +
            formatNakedNumbers(naked),
        );
      }
    } catch {
      // Auditing must never be the reason a response fails.
    }
  }

  return new Response(JSON.stringify(body), { ...init, headers });
}
