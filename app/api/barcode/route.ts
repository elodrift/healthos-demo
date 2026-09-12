/**
 * Resolve a barcode to a manufacturer's label.
 *
 * Proxied through the server rather than called from the browser for two
 * reasons: Open Food Facts asks for an identifying User-Agent that a browser
 * will not let us set, and routing it here keeps the user's IP out of a third
 * party's logs. The only thing that leaves this app is the barcode.
 *
 * Sign-in is required even though the lookup reads nothing user-specific — an
 * open proxy on someone else's free API is not something to ship.
 *
 * ## Why there is no `export const dynamic = "force-dynamic"` here
 *
 * There used to be, and it silently disabled the one thing protecting Open Food
 * Facts from this route. `dynamic = "force-dynamic"` is documented as equivalent
 * to setting every `fetch()` in the segment to `{ cache: "no-store",
 * revalidate: 0 }` — which overrode the `next: { revalidate: 86_400 }` in
 * lib/food/barcode.ts. The day-long label cache existed in the source and never
 * once took effect: every scan, including a rescan of the same packet seconds
 * later, was a live request to a donation-funded community API with a ~15/min
 * per-IP budget shared across all of Vercel's egress.
 *
 * The route is dynamic regardless — `headers()` and `auth.api.getSession()`
 * force it — so the directive bought nothing and cost the cache. Removing it
 * lets `revalidate` apply. The rate limit below is the second layer.
 */

import { headers } from "next/headers";
import { type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { lookupBarcode } from "@/lib/food/barcode";
import { jsonPrivate } from "@/lib/http";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // Next 14.2: headers() is synchronous.
  const session = await await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return jsonPrivate({ error: "Not signed in." }, { status: 401 });
  }

  /*
    Per-user, not per-IP. The shared resource being protected is Open Food Facts'
    per-IP allowance, and every request from this app leaves on the same Vercel
    egress IP — so an IP-keyed limit here would be one global bucket that any
    single user could exhaust for everyone. Keying on the session id caps each
    user individually, which is what actually keeps the aggregate under budget.
  */
  const limit = checkRateLimit("barcode", session.user.id);
  if (!limit.ok) {
    return tooManyRequests(
      "Too many lookups in a row. Give it a moment.",
      limit.retryAfter,
    );
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  const result = await lookupBarcode(code);

  /*
    Status codes mirror the epistemic distinction the type makes, so the client
    never has to guess why it got nothing:
      invalid     -> 400, the input was not a barcode
      not-found   -> 404, a real lookup that found no usable label
      unavailable -> 503, our lookup failed and says nothing about the product
  */
  if (result.kind === "invalid") {
    return jsonPrivate({ error: result.reason }, { status: 400 });
  }
  if (result.kind === "not-found") {
    return jsonPrivate({ error: "No label on file for that barcode." }, { status: 404 });
  }
  if (result.kind === "unavailable") {
    return jsonPrivate({ error: "The food database could not be reached." }, { status: 503 });
  }

  return jsonPrivate(result);
}
