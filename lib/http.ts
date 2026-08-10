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
  return new Response(JSON.stringify(body), { ...init, headers });
}
