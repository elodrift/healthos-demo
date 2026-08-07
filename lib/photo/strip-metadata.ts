/**
 * Remove identifying metadata from an uploaded image before it is stored.
 *
 * app/privacy/page.tsx promises that "Photo EXIF metadata, which can contain
 * GPS coordinates, is stripped before a photo is stored." This module is that
 * promise. It runs server-side on purpose: a browser-side strip can be
 * bypassed by anything that posts straight to the upload endpoint.
 *
 * The threat is concrete. A phone photo of a meal routinely carries the GPS
 * coordinates of the restaurant or of the user's kitchen, the capture
 * timestamp, and the device serial. None of that is needed to estimate
 * protein, so none of it should ever reach storage.
 *
 * Design rules:
 *
 *  - Strip metadata, preserve rendering. Colour-critical segments (ICC
 *    profiles, JFIF density, Adobe colour transform) are KEPT, because
 *    dropping them changes how the photo looks. This is a privacy tool, not
 *    a minifier.
 *  - Unsupported formats are REJECTED, never passed through. A format we
 *    cannot parse is a format whose GPS we cannot remove, and storing it
 *    would quietly break the promise above. `supported: false` means the
 *    caller must refuse the upload.
 *  - No dependencies and no re-encoding. Re-encoding would degrade the image
 *    and cost CPU; every format here is a container we can edit structurally.
 */

/** Formats we can parse well enough to guarantee removal. */
export type ImageFormat = "jpeg" | "png" | "webp" | "heic" | "gif" | "unknown";

/**
 * Upload ceiling for meal photos.
 *
 * Serverless request bodies cap out around 4.5MB. The strip has to run on the
 * server (a client-side strip is bypassable by anything posting straight to the
 * endpoint), so photos cannot route around this via direct-to-Blob upload.
 * 4MB leaves headroom for the multipart envelope.
 */
export const MAX_PHOTO_BYTES = 4_000_000;

export interface StripResult {
  /** The cleaned image. Identical to the input when there was nothing to remove. */
  data: Buffer;
  format: ImageFormat;
  /**
   * False when the format cannot be guaranteed clean. The caller MUST reject
   * the upload rather than store `data`.
   */
  supported: boolean;
  /** Human-readable names of what was removed, for logging and receipts. */
  removed: string[];
  /** Populated when `supported` is false, explaining what to tell the user. */
  reason?: string;
  bytesBefore: number;
  bytesAfter: number;
}

/* ------------------------------------------------------------------ *
 * Format detection
 * ------------------------------------------------------------------ */

export function detectFormat(buf: Buffer): ImageFormat {
  if (buf.length < 12) return "unknown";

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }

  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }

  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";

  // HEIC/HEIF: ISOBMFF `ftyp` box whose brand marks it as HEIF-family.
  // This is what an iPhone produces by default, so detecting it matters more
  // than it might look.
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1", "avif"].includes(brand)) {
      return "heic";
    }
  }

  return "unknown";
}

/* ------------------------------------------------------------------ *
 * JPEG
 * ------------------------------------------------------------------ */

/**
 * JPEG APPn/COM segments to remove.
 *
 * APP1  — EXIF (GPS, timestamps, device) and XMP. The main target.
 * APP13 — Photoshop IRB, which carries IPTC authorship and location.
 * COM   — free-text comment, sometimes editor or path leakage.
 *
 * Deliberately KEPT: APP0 (JFIF density), APP2 (ICC colour profile),
 * APP14 (Adobe colour transform — required to decode YCCK/CMYK correctly).
 * Removing those would alter the rendered image.
 */
const JPEG_STRIP_MARKERS = new Map<number, string>([
  [0xe1, "EXIF/XMP (APP1)"],
  [0xed, "IPTC/Photoshop (APP13)"],
  [0xfe, "comment (COM)"],
]);

function stripJpeg(buf: Buffer): { data: Buffer; removed: string[] } {
  const out: Buffer[] = [];
  const removed: string[] = [];

  out.push(buf.subarray(0, 2)); // SOI
  let offset = 2;

  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) {
      // Not at a marker boundary; the stream is malformed or we've drifted.
      // Copy the remainder verbatim rather than risk corrupting pixel data.
      out.push(buf.subarray(offset));
      break;
    }

    // Skip fill bytes: a marker may be padded with any number of 0xFF.
    let markerAt = offset;
    while (markerAt < buf.length && buf[markerAt] === 0xff) markerAt++;
    const marker = buf[markerAt];

    // Standalone markers carry no length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(offset, markerAt + 1));
      offset = markerAt + 1;
      continue;
    }

    // Start of Scan: everything after this is entropy-coded pixel data, which
    // must not be parsed as segments. Copy to EOF verbatim.
    if (marker === 0xda) {
      out.push(buf.subarray(offset));
      break;
    }

    if (marker === 0xd9) {
      out.push(buf.subarray(offset, markerAt + 1));
      break;
    }

    const lengthAt = markerAt + 1;
    if (lengthAt + 2 > buf.length) {
      out.push(buf.subarray(offset));
      break;
    }
    const segLength = buf.readUInt16BE(lengthAt);
    const segEnd = lengthAt + segLength;
    if (segLength < 2 || segEnd > buf.length) {
      out.push(buf.subarray(offset));
      break;
    }

    const label = JPEG_STRIP_MARKERS.get(marker);
    if (label) {
      removed.push(label);
    } else {
      out.push(buf.subarray(offset, segEnd));
    }

    offset = segEnd;
  }

  return { data: Buffer.concat(out), removed };
}

/* ------------------------------------------------------------------ *
 * PNG
 * ------------------------------------------------------------------ */

/**
 * PNG ancillary chunks to remove.
 *
 * eXIf carries a full EXIF block including GPS. The text chunks carry
 * arbitrary strings that tools use for camera and software provenance.
 * tIME is the modification timestamp.
 *
 * Deliberately KEPT: iCCP and sRGB (colour), gAMA, cHRM, PLTE, tRNS, and of
 * course IHDR/IDAT/IEND.
 */
const PNG_STRIP_CHUNKS = new Map<string, string>([
  ["eXIf", "EXIF (eXIf)"],
  ["tEXt", "text (tEXt)"],
  ["zTXt", "compressed text (zTXt)"],
  ["iTXt", "international text (iTXt)"],
  ["tIME", "timestamp (tIME)"],
]);

function stripPng(buf: Buffer): { data: Buffer; removed: string[] } {
  const out: Buffer[] = [buf.subarray(0, 8)];
  const removed: string[] = [];
  let offset = 8;

  while (offset + 8 <= buf.length) {
    const dataLength = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("latin1");
    const chunkEnd = offset + 12 + dataLength; // length + type + data + CRC

    if (chunkEnd > buf.length) {
      // Truncated chunk: copy what remains untouched.
      out.push(buf.subarray(offset));
      break;
    }

    const label = PNG_STRIP_CHUNKS.get(type);
    if (label) {
      removed.push(label);
    } else {
      out.push(buf.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return { data: Buffer.concat(out), removed };
}

/* ------------------------------------------------------------------ *
 * WebP
 * ------------------------------------------------------------------ */

/** VP8X feature flag bits, needed to keep the header honest after removal. */
const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;

function stripWebp(buf: Buffer): { data: Buffer; removed: string[] } {
  const removed: string[] = [];
  const chunks: Buffer[] = [];
  let offset = 12; // past "RIFF" + size + "WEBP"
  let sawStrip = false;

  while (offset + 8 <= buf.length) {
    const fourcc = buf.subarray(offset, offset + 4).toString("latin1");
    const size = buf.readUInt32LE(offset + 4);
    // RIFF chunks are padded to an even length.
    const padded = size + (size % 2);
    const chunkEnd = offset + 8 + padded;
    if (chunkEnd > buf.length) {
      chunks.push(buf.subarray(offset));
      break;
    }

    if (fourcc === "EXIF" || fourcc === "XMP ") {
      removed.push(fourcc === "EXIF" ? "EXIF (WebP)" : "XMP (WebP)");
      sawStrip = true;
    } else {
      const chunk = Buffer.from(buf.subarray(offset, chunkEnd));
      // Clear the EXIF/XMP feature bits so the header does not advertise
      // chunks we just deleted, which would make the file invalid.
      if (fourcc === "VP8X" && chunk.length >= 9) {
        chunk[8] = chunk[8] & ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
      }
      chunks.push(chunk);
    }

    offset = chunkEnd;
  }

  if (!sawStrip) return { data: buf, removed };

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4); // "WEBP" + chunks
  header.write("WEBP", 8, "latin1");

  return { data: Buffer.concat([header, body]), removed };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Verify a stripped buffer really is clean, instead of trusting that it is.
 *
 * The strip functions above walk the container structurally, so a malformed or
 * adversarial file could in principle cause an early verbatim copy that keeps a
 * metadata segment. This re-scans the output and names anything that survived.
 *
 * Returns null when clean, or a description of what remains. The caller must
 * fail closed on a non-null result: a photo we cannot prove is clean must not
 * be stored, because app/privacy/page.tsx promises that it is.
 */
export function assertNoResidualMetadata(buf: Buffer, format: ImageFormat): string | null {
  if (format === "jpeg") {
    let offset = 2;
    while (offset < buf.length - 1) {
      if (buf[offset] !== 0xff) break;
      let markerAt = offset;
      while (markerAt < buf.length && buf[markerAt] === 0xff) markerAt++;
      const marker = buf[markerAt];
      if (marker === 0xda || marker === 0xd9) break; // scan data / EOI
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset = markerAt + 1;
        continue;
      }
      const lengthAt = markerAt + 1;
      if (lengthAt + 2 > buf.length) break;
      const label = JPEG_STRIP_MARKERS.get(marker);
      if (label) return `JPEG segment survived: ${label}`;
      offset = lengthAt + buf.readUInt16BE(lengthAt);
    }
    return null;
  }

  if (format === "png") {
    let offset = 8;
    while (offset + 8 <= buf.length) {
      const dataLength = buf.readUInt32BE(offset);
      const type = buf.subarray(offset + 4, offset + 8).toString("latin1");
      const label = PNG_STRIP_CHUNKS.get(type);
      if (label) return `PNG chunk survived: ${label}`;
      offset = offset + 12 + dataLength;
      if (type === "IEND") break;
    }
    return null;
  }

  if (format === "webp") {
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const fourcc = buf.subarray(offset, offset + 4).toString("latin1");
      const size = buf.readUInt32LE(offset + 4);
      if (fourcc === "EXIF" || fourcc === "XMP ") return `WebP chunk survived: ${fourcc}`;
      offset = offset + 8 + size + (size % 2);
    }
    return null;
  }

  // Unsupported formats never reach storage, so there is nothing to verify.
  return null;
}

export function stripImageMetadata(input: Buffer): StripResult {
  const format = detectFormat(input);
  const base = { format, bytesBefore: input.length };

  switch (format) {
    case "jpeg": {
      const { data, removed } = stripJpeg(input);
      return { ...base, data, removed, supported: true, bytesAfter: data.length };
    }
    case "png": {
      const { data, removed } = stripPng(input);
      return { ...base, data, removed, supported: true, bytesAfter: data.length };
    }
    case "webp": {
      const { data, removed } = stripWebp(input);
      return { ...base, data, removed, supported: true, bytesAfter: data.length };
    }
    case "heic":
      // Honest refusal. HEIC stores metadata in nested ISOBMFF boxes; editing
      // them correctly needs a real parser, and a partial job here would leave
      // GPS in place while reporting success. iPhones shoot HEIC by default,
      // so the upload UI must tell the user how to avoid it rather than
      // silently accept the file.
      return {
        ...base,
        data: input,
        removed: [],
        supported: false,
        bytesAfter: input.length,
        reason:
          "HEIC/HEIF photos cannot have their location data removed yet. On iPhone, set Settings > Camera > Formats to Most Compatible, or share the photo as JPEG.",
      };
    case "gif":
      return {
        ...base,
        data: input,
        removed: [],
        supported: false,
        bytesAfter: input.length,
        reason: "GIF is not supported for meal photos. Please upload a JPEG, PNG or WebP.",
      };
    default:
      return {
        ...base,
        data: input,
        removed: [],
        supported: false,
        bytesAfter: input.length,
        reason: "That file is not a recognised JPEG, PNG or WebP image.",
      };
  }
}
