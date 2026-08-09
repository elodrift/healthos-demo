/**
 * Read a photo's capture timestamp out of EXIF — and nothing else.
 *
 * Why this exists
 * ---------------
 * People already photograph their food. That habit is the cheapest logging
 * mechanism available, because it costs the user nothing extra. But a photo is
 * the *weakest* evidence this app accepts: it shows neither a label nor a
 * portion, so its macros are always a guess.
 *
 * The one thing a photo does measure reliably is **when the meal happened**.
 * That fact was being thrown away: `POST /api/meals` derived the day from
 * `new Date()`, i.e. upload time. Someone reviewing brunch photos at 23:42
 * therefore logged four meals at midnight, and the planner's slot spacing —
 * wake offset, meal count, pre/post-training branches — reasoned about a day
 * that never happened.
 *
 * Relationship to the privacy promise
 * -----------------------------------
 * app/privacy/page.tsx promises EXIF "is stripped before a photo is stored",
 * and lib/photo/strip-metadata.ts keeps that promise. This module does NOT
 * weaken it:
 *
 *  - It only ever *reads*, and only from the in-memory upload buffer.
 *  - It extracts a single scalar: the capture timestamp. GPS coordinates,
 *    device serial, lens, software and every other tag are never returned, so
 *    they cannot be logged or persisted even by accident.
 *  - The strip still removes everything, including the timestamp tag. The
 *    stored bytes are exactly as clean as before this module existed.
 *  - It reports *whether* GPS was present as a boolean, never the value. That
 *    lets the upload receipt say "location was removed" truthfully instead of
 *    listing a segment name and hoping the user infers it.
 *
 * The honest caveat about time zones
 * ----------------------------------
 * EXIF `DateTimeOriginal` is naive wall-clock time with **no zone**. A photo
 * taken at 13:51 says "13:51" and nothing about where. So this returns wall
 * clock components, not an instant, and refuses to invent an offset. The
 * caller decides which zone to read it in — and must say so in the UI, because
 * a photo carried across time zones will be an hour or more out. That is a
 * smaller error than filing dinner at midnight, but it is still an assumption
 * and must not be presented as a measurement.
 *
 * No dependencies: this is a structural walk of the same containers
 * strip-metadata.ts already parses.
 */

/** EXIF tag ids we care about. Everything else is ignored by construction. */
const TAG_DATETIME_ORIGINAL = 0x9003; // when the shutter fired — preferred
const TAG_DATETIME_DIGITIZED = 0x9004; // when it was digitised — close enough
const TAG_DATETIME = 0x0132; // file modification — last resort
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;

/** TIFF type 2 = ASCII. The date tags are always ASCII "YYYY:MM:DD HH:MM:SS". */
const TIFF_TYPE_ASCII = 2;
const TIFF_TYPE_LONG = 4;

export interface CaptureTime {
  /**
   * Wall-clock components exactly as the camera recorded them. Deliberately
   * not a Date: a Date is an instant, and this data has no zone, so building
   * one here would silently attach the *server's* offset.
   */
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  /** Which tag it came from, so the UI can be precise about provenance. */
  tag: "DateTimeOriginal" | "DateTimeDigitized" | "DateTime";
}

export interface CaptureTimeResult {
  /** Null when the photo carried no readable timestamp. */
  capturedAt: CaptureTime | null;
  /**
   * True when a GPS IFD was present. The coordinates themselves are never
   * read, so this is safe to log and safe to show.
   */
  hadGps: boolean;
}

const EMPTY: CaptureTimeResult = { capturedAt: null, hadGps: false };

/**
 * Format as a naive wall-clock string for transport: "YYYY-MM-DDTHH:MM".
 * Deliberately no "Z" and no offset — appending one would assert a zone this
 * data does not have, and `new Date("...Z")` on the far side would then shift
 * the meal by the server's offset.
 */
export function formatWallClock(t: CaptureTime): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.year}-${p(t.month)}-${p(t.day)}T${p(t.hour)}:${p(t.minute)}`;
}

/** Parse EXIF's "YYYY:MM:DD HH:MM:SS" (and the ISO-ish variants seen in the wild). */
function parseExifDate(raw: string): Omit<CaptureTime, "tag"> | null {
  const m = raw
    .trim()
    .replace(/\0+$/, "")
    .match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);

  // Cameras with a dead clock battery emit 0000:00:00 or 1970 placeholders.
  // A nonsense date is worse than no date: it would file the meal on a day the
  // user cannot see, so treat it as absent.
  if (year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  return { year, month, day, hour, minute };
}

/**
 * Walk one TIFF IFD, collecting the date tags and noting a GPS pointer.
 *
 * `seen` guards against a malformed file whose SubIFD pointer loops back —
 * without it a crafted photo could spin this function forever inside an
 * upload request.
 */
function readIfd(
  buf: Buffer,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
  found: Map<number, string>,
  state: { hadGps: boolean },
  seen: Set<number>,
  depth = 0,
): void {
  if (depth > 4 || seen.has(ifdOffset)) return;
  seen.add(ifdOffset);

  const at = tiffStart + ifdOffset;
  if (at + 2 > buf.length) return;

  const count = little ? buf.readUInt16LE(at) : buf.readUInt16BE(at);
  // 12 bytes per entry. A count that overruns the buffer means a corrupt or
  // hostile file; bail rather than read past the end.
  if (count > 512 || at + 2 + count * 12 > buf.length) return;

  for (let i = 0; i < count; i++) {
    const entry = at + 2 + i * 12;
    const tag = little ? buf.readUInt16LE(entry) : buf.readUInt16BE(entry);
    const type = little ? buf.readUInt16LE(entry + 2) : buf.readUInt16BE(entry + 2);
    const length = little ? buf.readUInt32LE(entry + 4) : buf.readUInt32BE(entry + 4);
    const valueAt = entry + 8;

    if (tag === TAG_GPS_IFD_POINTER) {
      // Presence only. The coordinates are never read: a value we never load
      // cannot leak into a log line or a response body.
      state.hadGps = true;
      continue;
    }

    if (tag === TAG_EXIF_IFD_POINTER && type === TIFF_TYPE_LONG) {
      const sub = little ? buf.readUInt32LE(valueAt) : buf.readUInt32BE(valueAt);
      readIfd(buf, tiffStart, sub, little, found, state, seen, depth + 1);
      continue;
    }

    const isDateTag =
      tag === TAG_DATETIME_ORIGINAL || tag === TAG_DATETIME_DIGITIZED || tag === TAG_DATETIME;
    if (!isDateTag || type !== TIFF_TYPE_ASCII) continue;

    // ASCII values longer than 4 bytes live at an offset; the date strings are
    // 20 bytes, so in practice always indirect.
    const dataAt =
      length > 4 ? tiffStart + (little ? buf.readUInt32LE(valueAt) : buf.readUInt32BE(valueAt)) : valueAt;
    if (dataAt < 0 || dataAt + Math.min(length, 24) > buf.length) continue;

    found.set(tag, buf.subarray(dataAt, dataAt + Math.min(length, 24)).toString("latin1"));
  }
}

/** Parse a TIFF block (the payload of an EXIF segment) for the date tags. */
function readTiff(buf: Buffer, tiffStart: number): CaptureTimeResult {
  if (tiffStart + 8 > buf.length) return EMPTY;

  const byteOrder = buf.subarray(tiffStart, tiffStart + 2).toString("latin1");
  if (byteOrder !== "II" && byteOrder !== "MM") return EMPTY;
  const little = byteOrder === "II";

  const magic = little ? buf.readUInt16LE(tiffStart + 2) : buf.readUInt16BE(tiffStart + 2);
  if (magic !== 42) return EMPTY;

  const ifd0 = little ? buf.readUInt32LE(tiffStart + 4) : buf.readUInt32BE(tiffStart + 4);

  const found = new Map<number, string>();
  const state = { hadGps: false };
  readIfd(buf, tiffStart, ifd0, little, found, state, new Set());

  // Preference order: the shutter beats the digitiser beats file mtime.
  const candidates: Array<[number, CaptureTime["tag"]]> = [
    [TAG_DATETIME_ORIGINAL, "DateTimeOriginal"],
    [TAG_DATETIME_DIGITIZED, "DateTimeDigitized"],
    [TAG_DATETIME, "DateTime"],
  ];

  for (const [tag, name] of candidates) {
    const raw = found.get(tag);
    if (!raw) continue;
    const parsed = parseExifDate(raw);
    if (parsed) return { capturedAt: { ...parsed, tag: name }, hadGps: state.hadGps };
  }

  return { capturedAt: null, hadGps: state.hadGps };
}

/* ------------------------------------------------------------------ *
 * Container entry points
 * ------------------------------------------------------------------ */

function fromJpeg(buf: Buffer): CaptureTimeResult {
  let offset = 2;
  let hadGps = false;

  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) break;

    let markerAt = offset;
    while (markerAt < buf.length && buf[markerAt] === 0xff) markerAt++;
    const marker = buf[markerAt];

    // Pixel data starts here; no metadata segments beyond it.
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerAt + 1;
      continue;
    }

    const lengthAt = markerAt + 1;
    if (lengthAt + 2 > buf.length) break;
    const segLength = buf.readUInt16BE(lengthAt);
    const segEnd = lengthAt + segLength;
    if (segLength < 2 || segEnd > buf.length) break;

    if (marker === 0xe1) {
      const header = buf.subarray(lengthAt + 2, lengthAt + 8).toString("latin1");
      if (header === "Exif\0\0") {
        const result = readTiff(buf, lengthAt + 8);
        if (result.capturedAt) return result;
        hadGps = hadGps || result.hadGps;
      }
    }

    offset = segEnd;
  }

  return { capturedAt: null, hadGps };
}

function fromPng(buf: Buffer): CaptureTimeResult {
  let offset = 8;
  let hadGps = false;

  while (offset + 8 <= buf.length) {
    const dataLength = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("latin1");
    const dataAt = offset + 8;
    const chunkEnd = dataAt + dataLength + 4;
    if (chunkEnd > buf.length) break;

    if (type === "eXIf") {
      const result = readTiff(buf.subarray(dataAt, dataAt + dataLength), 0);
      if (result.capturedAt) return result;
      hadGps = hadGps || result.hadGps;
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return { capturedAt: null, hadGps };
}

function fromWebp(buf: Buffer): CaptureTimeResult {
  let offset = 12;
  let hadGps = false;

  while (offset + 8 <= buf.length) {
    const fourcc = buf.subarray(offset, offset + 4).toString("latin1");
    const size = buf.readUInt32LE(offset + 4);
    const dataAt = offset + 8;
    if (dataAt + size > buf.length) break;

    if (fourcc === "EXIF") {
      // Some encoders prefix the WebP EXIF payload with the JPEG-style header.
      const slice = buf.subarray(dataAt, dataAt + size);
      const skip = slice.subarray(0, 6).toString("latin1") === "Exif\0\0" ? 6 : 0;
      const result = readTiff(slice, skip);
      if (result.capturedAt) return result;
      hadGps = hadGps || result.hadGps;
    }

    offset = dataAt + size + (size % 2);
  }

  return { capturedAt: null, hadGps };
}

/**
 * Read the capture timestamp from the ORIGINAL upload bytes.
 *
 * Must be called before stripImageMetadata(), which deliberately destroys this
 * tag. Never throws: a photo whose EXIF we cannot parse simply has no capture
 * time, and the caller falls back to upload time while saying so.
 */
export function readCaptureTime(input: Buffer): CaptureTimeResult {
  try {
    if (input.length < 12) return EMPTY;

    if (input[0] === 0xff && input[1] === 0xd8) return fromJpeg(input);
    if (input[0] === 0x89 && input.subarray(1, 4).toString("latin1") === "PNG") return fromPng(input);
    if (
      input.subarray(0, 4).toString("latin1") === "RIFF" &&
      input.subarray(8, 12).toString("latin1") === "WEBP"
    ) {
      return fromWebp(input);
    }

    return EMPTY;
  } catch {
    // A malformed photo must not fail an upload that is otherwise fine.
    return EMPTY;
  }
}
