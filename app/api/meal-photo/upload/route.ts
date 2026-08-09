import { put } from "@vercel/blob";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { recognizeFood } from "@/lib/food/recognize";
import { formatWallClock, readCaptureTime } from "@/lib/photo/capture-time";
import { mealPhotoPrefix } from "@/lib/photo/photo-path";
import { assertNoResidualMetadata, MAX_PHOTO_BYTES, stripImageMetadata } from "@/lib/photo/strip-metadata";

export const dynamic = "force-dynamic";
// Strip + private store + a vision call. The default 10s is not enough headroom
// for the model leg, and a timeout here would look to the user like a lost photo.
export const maxDuration = 45;

/**
 * Upload a meal photo.
 *
 * This route exists because the EXIF strip has to happen on the server.
 *
 * Vercel Blob also supports client-side direct upload, which would sidestep the
 * request body limit noted below — but the browser would then hand the file
 * straight to Blob and our stripper would never see it. app/privacy/page.tsx
 * promises that GPS metadata "is stripped before a photo is stored", so the
 * bytes must pass through here first. The size ceiling is the price of keeping
 * that promise true, and it is the right trade.
 *
 * Consequences of that choice, handled explicitly:
 *  - Serverless request bodies cap out around 4.5MB, so anything larger is
 *    refused with an actionable message rather than a 413 the UI can't explain.
 *  - Formats the stripper cannot parse are refused, never stored. See
 *    `supported: false` in lib/photo/strip-metadata.ts.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Reject oversized uploads before buffering the body into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      {
        error: `That photo is ${(declaredLength / 1_000_000).toFixed(1)}MB. The limit is ${
          MAX_PHOTO_BYTES / 1_000_000
        }MB because every photo is scrubbed of location data on the server before it is stored. Most phones can share a smaller copy.`,
      },
      { status: 413 },
    );
  }

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: "That upload could not be read. Please try again." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No photo was attached." }, { status: 400 });
  }

  // content-length covers the whole multipart envelope; check the part too.
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      {
        error: `That photo is ${(file.size / 1_000_000).toFixed(1)}MB, over the ${
          MAX_PHOTO_BYTES / 1_000_000
        }MB limit.`,
      },
      { status: 413 },
    );
  }

  const original = Buffer.from(await file.arrayBuffer());

  /*
    Read the capture timestamp BEFORE stripping, because the strip destroys the
    tag that carries it. This is the one fact a food photo actually measures,
    and it was being thrown away: the meal was previously filed against upload
    time, so photos reviewed late at night landed at midnight.

    This does not weaken the privacy promise. Only the timestamp is extracted —
    GPS is reported as a presence boolean and its coordinates are never read,
    and the bytes that reach Blob are stripped exactly as before.
  */
  const capture = readCaptureTime(original);

  const result = stripImageMetadata(original);

  // A format we cannot parse is a format whose GPS we cannot remove. Refusing
  // is the only honest option; storing it would quietly break the promise.
  if (!result.supported) {
    return NextResponse.json({ error: result.reason ?? "That image format is not supported." }, { status: 415 });
  }

  // Defence in depth: prove the strip worked rather than trusting it. If a
  // marker survived, fail closed instead of storing a located photo.
  const residual = assertNoResidualMetadata(result.data, result.format);
  if (residual) {
    console.error("[v0] strip verification failed", { format: result.format, residual });
    return NextResponse.json(
      { error: "That photo could not be cleaned of location data, so it was not saved." },
      { status: 422 },
    );
  }

  // Path is namespaced per user. `addRandomSuffix` prevents one upload from
  // overwriting another and stops pathnames being guessable from the filename.
  const extension = result.format === "jpeg" ? "jpg" : result.format;
  const blob = await put(`${mealPhotoPrefix(session.user.id)}${Date.now()}.${extension}`, result.data, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || `image/${result.format}`,
  });

  // Recognition runs on the *stripped* bytes, so the photo's GPS never reaches
  // a third-party model. It is deliberately not allowed to fail the upload: the
  // photo is already stored and clean, and a model outage should downgrade the
  // user to typing the meal in, not lose their photo.
  const recognition = await recognizeFood(result.data, `image/${result.format}`);

  return NextResponse.json({
    // Deliberately the pathname, not blob.url: a private blob URL is not
    // publicly fetchable, and returning it would invite a broken <img src>.
    pathname: blob.pathname,
    removed: result.removed,
    bytesBefore: result.bytesBefore,
    bytesAfter: result.bytesAfter,
    recognition,
    /*
      A naive wall-clock string with no zone or "Z" suffix, because EXIF has no
      zone. Attaching one here would assert an offset the camera never recorded;
      the client reads it in the user's own zone and the UI says so.
    */
    capturedAt: capture.capturedAt ? formatWallClock(capture.capturedAt) : null,
    capturedAtTag: capture.capturedAt?.tag ?? null,
    /* Presence only — coordinates are never read, so none can leak here. */
    hadGps: capture.hadGps,
  });
}
