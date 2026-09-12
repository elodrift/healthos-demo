import { get } from "@vercel/blob";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { log } from "@/lib/log";
import { mealPhotoPrefix } from "@/lib/photo/photo-path";

// Removed for cacheComponents compatibility

/**
 * Serve a private meal photo to its owner.
 *
 * The blob store is private, so `blob.url` is not publicly fetchable and photos
 * have to be streamed through a route that checks who is asking.
 *
 * Ownership is enforced by pathname prefix rather than by a database lookup.
 * Upload writes every photo to `meal-photos/<userId>/…`, so the prefix is
 * authoritative — and unlike a `meal_log` lookup it also covers a photo that
 * has been uploaded but not yet attached to a logged meal. Without this check
 * any signed-in user could read any other user's photo by passing its pathname.
 */
export async function GET(request: NextRequest) {
  const session = await await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname." }, { status: 400 });
  }

  if (!pathname.startsWith(mealPhotoPrefix(session.user.id))) {
    // Deliberately 404, not 403: confirming a pathname exists but belongs to
    // someone else is itself a disclosure.
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });

    if (!result) return new NextResponse("Not found", { status: 404 });

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" },
      });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        // `private` keeps the photo out of shared/CDN caches.
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    log.error("photo.fetch_failed", {}, error);
    return NextResponse.json({ error: "That photo could not be loaded." }, { status: 500 });
  }
}
