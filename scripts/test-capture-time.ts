/**
 * Prove the EXIF capture-time reader works, and — more importantly — prove it
 * does not weaken the strip.
 *
 * The EXIF blocks here are built byte by byte rather than loaded from fixture
 * photos, because the interesting cases (big-endian, GPS present, dead camera
 * clock, pointer loop) are hard to obtain as real files and trivial to
 * construct. The JPEG container around them is the real thing: SOI, APP1, a
 * minimal SOS, EOI.
 *
 * Run: npx tsx scripts/test-capture-time.ts
 */

import { formatWallClock, readCaptureTime } from "../lib/photo/capture-time";
import { instantFromWallClock, localDay } from "../lib/live/local-day";
import { assertNoResidualMetadata, stripImageMetadata } from "../lib/photo/strip-metadata";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ *
 * EXIF construction
 * ------------------------------------------------------------------ */

interface Tag {
  id: number;
  type: number;
  value: string | number;
}

/**
 * Build a TIFF block with IFD0 -> ExifIFD, where the date tag lives in the
 * SubIFD exactly as a real camera writes it.
 */
function buildTiff(opts: { little: boolean; dateTag?: number; date?: string; withGps?: boolean }): Buffer {
  const { little, dateTag = 0x9003, date = "2026:08:09 13:51:04", withGps = false } = opts;

  const u16 = (n: number) => {
    const b = Buffer.alloc(2);
    little ? b.writeUInt16LE(n) : b.writeUInt16BE(n);
    return b;
  };
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    little ? b.writeUInt32LE(n) : b.writeUInt32BE(n);
    return b;
  };

  const header = Buffer.concat([Buffer.from(little ? "II" : "MM", "latin1"), u16(42), u32(8)]);

  // Layout: IFD0 at 8. Entries: ExifIFDPointer (+ optional GPSPointer).
  const ifd0Count = withGps ? 2 : 1;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const subIfdOffset = 8 + ifd0Size;

  const dateBytes = Buffer.from(date + "\0", "latin1");
  const subIfdSize = 2 + 1 * 12 + 4;
  const dateOffset = subIfdOffset + subIfdSize;

  const entry = (t: Tag) => {
    const parts = [u16(t.id), u16(t.type)];
    if (t.type === 4) {
      parts.push(u32(1), u32(t.value as number));
    } else {
      // ASCII, stored indirectly at `value` (an offset).
      parts.push(u32(dateBytes.length), u32(t.value as number));
    }
    return Buffer.concat(parts);
  };

  const ifd0Entries: Buffer[] = [entry({ id: 0x8769, type: 4, value: subIfdOffset })];
  if (withGps) {
    // Points at the date block; the reader must never follow it, only note it.
    ifd0Entries.push(entry({ id: 0x8825, type: 4, value: dateOffset }));
  }
  // Tag ids within an IFD must ascend; 0x8769 < 0x8825 already holds.
  const ifd0 = Buffer.concat([u16(ifd0Count), ...ifd0Entries, u32(0)]);

  const subIfd = Buffer.concat([u16(1), entry({ id: dateTag, type: 2, value: dateOffset }), u32(0)]);

  return Buffer.concat([header, ifd0, subIfd, dateBytes]);
}

/** Wrap a TIFF block in a JPEG APP1 segment inside a minimal valid JPEG. */
function buildJpeg(tiff: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1]),
    length,
    payload,
    // A tiny SOS + fake entropy data, so the parser meets a real scan boundary.
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    Buffer.from([0x12, 0x34, 0x56, 0x78]),
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

console.log("\nreading the capture time");

{
  const r = readCaptureTime(buildJpeg(buildTiff({ little: true })));
  check("little-endian DateTimeOriginal", r.capturedAt !== null);
  check(
    "wall clock is 2026-08-09T13:51",
    r.capturedAt !== null && formatWallClock(r.capturedAt) === "2026-08-09T13:51",
    r.capturedAt ? formatWallClock(r.capturedAt) : "null",
  );
  check("tag named DateTimeOriginal", r.capturedAt?.tag === "DateTimeOriginal");
  check("no GPS reported when absent", r.hadGps === false);
}

{
  // Big-endian ("MM") is what many cameras actually write; a reader that only
  // handles Intel order silently returns nothing on those photos.
  const r = readCaptureTime(buildJpeg(buildTiff({ little: false })));
  check(
    "big-endian is read identically",
    r.capturedAt !== null && formatWallClock(r.capturedAt) === "2026-08-09T13:51",
    r.capturedAt ? formatWallClock(r.capturedAt) : "null",
  );
}

{
  const r = readCaptureTime(buildJpeg(buildTiff({ little: true, withGps: true })));
  check("GPS presence detected", r.hadGps === true);
  check("capture time still read alongside GPS", r.capturedAt !== null);
  // The whole privacy argument rests on this: presence is a boolean and the
  // result carries no coordinate fields at all.
  check(
    "result exposes no coordinate data",
    Object.keys(r).sort().join(",") === "capturedAt,hadGps",
    Object.keys(r).join(","),
  );
}

{
  // Dead clock battery. A 1970 or 0000 date must read as absent, not as a meal
  // logged 56 years ago.
  const dead = readCaptureTime(buildJpeg(buildTiff({ little: true, date: "0000:00:00 00:00:00" })));
  check("zeroed camera clock is treated as absent", dead.capturedAt === null);

  const old = readCaptureTime(buildJpeg(buildTiff({ little: true, date: "1970:01:01 00:00:00" })));
  check("1970 placeholder is treated as absent", old.capturedAt === null);
}

{
  const none = readCaptureTime(
    Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), Buffer.from([0xff, 0xd9])]),
  );
  check("JPEG with no EXIF yields null", none.capturedAt === null && none.hadGps === false);

  check("garbage buffer does not throw", readCaptureTime(Buffer.from("not an image")).capturedAt === null);
  check("empty buffer does not throw", readCaptureTime(Buffer.alloc(0)).capturedAt === null);
}

console.log("\nthe strip is unchanged by all of this");

{
  const jpeg = buildJpeg(buildTiff({ little: true, withGps: true }));

  // The point of the feature: readable before, gone after.
  check("capture time readable before strip", readCaptureTime(jpeg).capturedAt !== null);

  const stripped = stripImageMetadata(jpeg);
  check("strip still reports EXIF removed", stripped.removed.some((r) => r.includes("APP1")));
  check("strip still verifies clean", assertNoResidualMetadata(stripped.data, stripped.format) === null);

  // The claim the privacy page makes: the STORED bytes carry nothing.
  const after = readCaptureTime(stripped.data);
  check("capture time NOT readable after strip", after.capturedAt === null);
  check("GPS NOT present after strip", after.hadGps === false);
}

console.log("\nwall clock to instant");

{
  // A naive wall clock read in a zone must land on the right local day — the
  // bug being fixed was a late-night upload filing brunch on the wrong day.
  const i = instantFromWallClock("2026-08-09T13:51", "Asia/Bangkok");
  check("Bangkok 13:51 resolves", i !== null);
  check(
    "Bangkok 13:51 is 06:51Z",
    i !== null && i.toISOString().startsWith("2026-08-09T06:51"),
    i?.toISOString(),
  );
  check("and reads back as the same local day", i !== null && localDay(i, "Asia/Bangkok") === "2026-08-09");
}

{
  // Round-trip across a range of zones and hours, including the 00:xx hour that
  // an ICU "hour 24" quirk would break.
  const zones = ["UTC", "Asia/Bangkok", "America/Los_Angeles", "Europe/London", "Pacific/Kiritimati"];
  const clocks = ["2026-08-09T00:10", "2026-08-09T13:51", "2026-01-15T23:55", "2026-06-30T12:00"];
  let bad = 0;
  for (const z of zones) {
    for (const c of clocks) {
      const inst = instantFromWallClock(c, z);
      if (!inst || localDay(inst, z) !== c.slice(0, 10)) {
        bad++;
        console.error(`        ${z} ${c} -> ${inst ? localDay(inst, z) : "null"}`);
      }
    }
  }
  check(`round-trips in ${zones.length} zones x ${clocks.length} clocks`, bad === 0, `${bad} mismatched`);
}

{
  // DST spring-forward in Los Angeles: 02:30 on 2026-03-08 does not exist. The
  // helper must still return a real instant on the correct day rather than null
  // or a day earlier.
  const i = instantFromWallClock("2026-03-08T02:30", "America/Los_Angeles");
  check("nonexistent DST hour still resolves", i !== null, String(i));
  check("and stays on 2026-03-08", i !== null && localDay(i, "America/Los_Angeles") === "2026-03-08");
}

{
  check("unknown zone returns null, not UTC", instantFromWallClock("2026-08-09T13:51", "Mars/Olympus") === null);
  check("malformed wall clock returns null", instantFromWallClock("nonsense", "UTC") === null);
  check("a zoned string is refused", instantFromWallClock("2026-08-09T13:51Z", "UTC") === null);
}

console.log(
  failures === 0 ? "\nall capture-time checks passed\n" : `\n${failures} capture-time check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
