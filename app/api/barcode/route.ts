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
 */

import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { lookupBarcode } from "@/lib/food/barcode";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Next 14.2: headers() is synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  if (result.kind === "not-found") {
    return NextResponse.json(
      { error: "No label on file for that barcode." },
      { status: 404 },
    );
  }
  if (result.kind === "unavailable") {
    return NextResponse.json(
      { error: "The food database could not be reached." },
      { status: 503 },
    );
  }

  return NextResponse.json(result);
}
