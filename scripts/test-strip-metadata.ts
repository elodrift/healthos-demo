/**
 * Verification for lib/photo/strip-metadata.ts.
 *
 * The privacy policy makes a factual claim about GPS removal, so this asserts
 * the claim rather than the code's structure: after stripping, the GPS bytes
 * must be absent from the output buffer, and the image must still be a valid,
 * decodable file of the same dimensions.
 *
 * Run with: npm run test:strip
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertNoResidualMetadata, detectFormat, stripImageMetadata } from "../lib/photo/strip-metadata";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  pass  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  }
}

/* --- PNG CRC, needed to build a valid chunk to inject --------------- */

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** A recognisable GPS payload we can search for in the output. */
const GPS_NEEDLE = "GPSLatitude:47.3769,GPSLongitude:8.5417";

/* ------------------------------------------------------------------ */

console.log("1. Format detection");
{
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)]);
  const webp = Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "latin1"),
  ]);
  const heic = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic", "latin1"), Buffer.alloc(4)]);
  const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(8)]);

  check("png", detectFormat(png) === "png", detectFormat(png));
  check("jpeg", detectFormat(jpeg) === "jpeg", detectFormat(jpeg));
  check("webp", detectFormat(webp) === "webp", detectFormat(webp));
  check("heic", detectFormat(heic) === "heic", detectFormat(heic));
  check("gif", detectFormat(gif) === "gif", detectFormat(gif));
  check("truncated input is not misread", detectFormat(Buffer.alloc(4)) === "unknown");
}

console.log("\n2. PNG: injected EXIF/GPS and text are removed, image survives");
{
  const dir = join(process.cwd(), "public", "feed");
  const file = readdirSync(dir).find((f) => f.endsWith(".png"));
  if (!file) throw new Error("no PNG fixture found in public/feed");
  const original = readFileSync(join(dir, file));

  // Splice metadata chunks in immediately after IHDR (offset 8 + 25 bytes).
  const ihdrEnd = 8 + 25;
  const dirty = Buffer.concat([
    original.subarray(0, ihdrEnd),
    pngChunk("eXIf", Buffer.from(GPS_NEEDLE, "latin1")),
    pngChunk("tEXt", Buffer.from("Software\0Camera 1.0", "latin1")),
    pngChunk("tIME", Buffer.alloc(7)),
    original.subarray(ihdrEnd),
  ]);

  check("fixture really contains the GPS needle", dirty.includes(GPS_NEEDLE));

  const res = stripImageMetadata(dirty);
  check("supported", res.supported === true);
  check("GPS bytes are gone", !res.data.includes(GPS_NEEDLE));
  check("text chunk gone", !res.data.includes("Camera 1.0"));
  check("reported eXIf removal", res.removed.some((r) => r.includes("eXIf")), res.removed);
  check("reported tIME removal", res.removed.some((r) => r.includes("tIME")), res.removed);
  check("output is byte-identical to the clean original", res.data.equals(original));
  check("IHDR preserved", res.data.subarray(12, 16).toString("latin1") === "IHDR");
  check("IEND preserved", res.data.subarray(res.data.length - 8, res.data.length - 4).toString("latin1") === "IEND");
  check(
    "dimensions unchanged",
    res.data.readUInt32BE(16) === original.readUInt32BE(16) &&
      res.data.readUInt32BE(20) === original.readUInt32BE(20),
    [res.data.readUInt32BE(16), res.data.readUInt32BE(20)],
  );
  check("bytes shrank", res.bytesAfter < res.bytesBefore, [res.bytesBefore, res.bytesAfter]);
}

console.log("\n3. PNG: already-clean files pass through untouched");
{
  const dir = join(process.cwd(), "public", "feed");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".png")).slice(0, 4)) {
    const original = readFileSync(join(dir, file));
    const res = stripImageMetadata(original);
    check(`${file} unchanged`, res.data.equals(original) && res.removed.length === 0, res.removed);
  }
}

console.log("\n4. JPEG: APP1/EXIF removed, colour segments and pixel data kept");
{
  const seg = (marker: number, payload: Buffer) => {
    const head = Buffer.alloc(4);
    head[0] = 0xff;
    head[1] = marker;
    head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([head, payload]);
  };

  const iccPayload = Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.alloc(16, 0x11)]);
  // Entropy-coded data deliberately contains 0xFFE1, which a naive parser
  // would mistake for an APP1 marker and corrupt the image.
  const scanData = Buffer.from([0xff, 0x00, 0x12, 0xff, 0xe1, 0x34, 0xff, 0x00, 0x56]);

  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.concat([Buffer.from("JFIF\0", "latin1"), Buffer.alloc(9)])),
    seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from(GPS_NEEDLE, "latin1")])),
    seg(0xe2, iccPayload),
    seg(0xed, Buffer.from("Photoshop 3.0\0IPTC-location", "latin1")),
    seg(0xfe, Buffer.from("created on my phone", "latin1")),
    seg(0xdb, Buffer.alloc(64, 0x08)),
    seg(0xda, Buffer.from([0x01, 0x01, 0x00])),
    scanData,
    Buffer.from([0xff, 0xd9]),
  ]);

  check("fixture contains GPS", jpeg.includes(GPS_NEEDLE));

  const res = stripImageMetadata(jpeg);
  check("supported", res.supported === true);
  check("GPS gone", !res.data.includes(GPS_NEEDLE));
  check("IPTC gone", !res.data.includes("IPTC-location"));
  check("comment gone", !res.data.includes("created on my phone"));
  check("JFIF kept (density)", res.data.includes("JFIF"));
  check("ICC profile kept (colour)", res.data.includes("ICC_PROFILE"));
  check("quantisation table kept", res.data.includes(Buffer.alloc(64, 0x08)));
  check("SOI intact", res.data[0] === 0xff && res.data[1] === 0xd8);
  check("EOI intact", res.data[res.data.length - 2] === 0xff && res.data[res.data.length - 1] === 0xd9);
  check("scan data copied verbatim, 0xFFE1 inside it untouched", res.data.includes(scanData));
  check("reported all three removals", res.removed.length === 3, res.removed);
}

console.log("\n5. WebP: EXIF/XMP chunks removed and VP8X flags corrected");
{
  const chunk = (fourcc: string, payload: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(fourcc, 0, "latin1");
    head.writeUInt32LE(payload.length, 4);
    const pad = payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([head, payload, pad]);
  };

  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04 | 0x20; // EXIF + XMP + ICC advertised
  const body = Buffer.concat([
    chunk("VP8X", vp8x),
    chunk("VP8 ", Buffer.alloc(20, 0x33)),
    chunk("EXIF", Buffer.from(GPS_NEEDLE, "latin1")),
    chunk("XMP ", Buffer.from("<x:xmpmeta>loc</x:xmpmeta>", "latin1")),
  ]);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "latin1");
  const webp = Buffer.concat([header, body]);

  const res = stripImageMetadata(webp);
  check("supported", res.supported === true);
  check("GPS gone", !res.data.includes(GPS_NEEDLE));
  check("XMP gone", !res.data.includes("xmpmeta"));
  check("image data kept", res.data.includes(Buffer.alloc(20, 0x33)));
  check(
    "RIFF size updated to match new length",
    res.data.readUInt32LE(4) === res.data.length - 8,
    [res.data.readUInt32LE(4), res.data.length - 8],
  );
  const flags = res.data[20]; // 12 header + 8 chunk header
  check("EXIF flag cleared", (flags & 0x08) === 0, flags);
  check("XMP flag cleared", (flags & 0x04) === 0, flags);
  check("ICC flag preserved", (flags & 0x20) === 0x20, flags);
}

console.log("\n6. Unsupported formats are refused, never passed through as clean");
{
  const heic = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from("ftypheic", "latin1"),
    Buffer.from(GPS_NEEDLE, "latin1"),
  ]);
  const res = stripImageMetadata(heic);
  check("heic not supported", res.supported === false);
  check("heic reason mentions iPhone setting", /iPhone/i.test(res.reason ?? ""), res.reason);
  check("heic GPS still present, proving we did not claim success", res.data.includes(GPS_NEEDLE));

  const junk = stripImageMetadata(Buffer.from("this is a text file, not an image"));
  check("unknown not supported", junk.supported === false);
  check("unknown has a reason", Boolean(junk.reason));

  const gif = stripImageMetadata(Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(8)]));
  check("gif not supported", gif.supported === false);
}

console.log("\n7. Stripping is idempotent");
{
  const dir = join(process.cwd(), "public", "feed");
  const file = readdirSync(dir).find((f) => f.endsWith(".png"))!;
  const original = readFileSync(join(dir, file));
  const dirty = Buffer.concat([
    original.subarray(0, 33),
    pngChunk("eXIf", Buffer.from(GPS_NEEDLE, "latin1")),
    original.subarray(33),
  ]);
  const once = stripImageMetadata(dirty).data;
  const twice = stripImageMetadata(once).data;
  check("second pass is a no-op", once.equals(twice));
  check("second pass reports nothing removed", stripImageMetadata(once).removed.length === 0);
}

console.log("\n8. Malformed input does not throw");
{
  const cases: Array<[string, Buffer]> = [
    ["empty", Buffer.alloc(0)],
    ["jpeg header only", Buffer.from([0xff, 0xd8, 0xff])],
    ["png header only", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["jpeg with absurd segment length", Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00])],
    [
      "png with truncated chunk",
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0xff, 0x00]),
        Buffer.from("eXIf", "latin1"),
      ]),
    ],
  ];
  for (const [label, buf] of cases) {
    let threw = false;
    try {
      stripImageMetadata(buf);
    } catch {
      threw = true;
    }
    check(`${label} handled without throwing`, !threw);
  }
}

/* --- assertNoResidualMetadata ---------------------------------------- *
 *
 * This is the upload route's fail-closed gate, so it has to be a real check
 * and not a function that always returns null. Two directions are asserted:
 * it must find metadata in a dirty buffer, and find none after stripping.
 * ------------------------------------------------------------------ */
{
  console.log("\nassertNoResidualMetadata:");

  // A hand-built JPEG carrying an APP1/EXIF segment.
  const dirtyJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1, 0x00, 0x0c]), // APP1, length 12
    Buffer.from("Exif\0\0", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0xff, 0xda]), // SOS
    Buffer.from([0x00, 0x00]),
  ]);
  check(
    "detects EXIF in a dirty JPEG",
    assertNoResidualMetadata(dirtyJpeg, "jpeg") !== null,
    assertNoResidualMetadata(dirtyJpeg, "jpeg"),
  );
  check(
    "reports clean after stripping that JPEG",
    assertNoResidualMetadata(stripImageMetadata(dirtyJpeg).data, "jpeg") === null,
  );

  // WebP with an EXIF chunk.
  const exifChunk = Buffer.concat([
    Buffer.from("EXIF", "latin1"),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(4, 0);
      return b;
    })(),
    Buffer.from([0x01, 0x02, 0x03, 0x04]),
  ]);
  const webpBody = Buffer.concat([Buffer.from("VP8 ", "latin1"), Buffer.from([0x04, 0x00, 0x00, 0x00]), Buffer.from([0, 0, 0, 0]), exifChunk]);
  const dirtyWebp = Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(4 + webpBody.length, 0);
      return b;
    })(),
    Buffer.from("WEBP", "latin1"),
    webpBody,
  ]);
  check("detects EXIF in a dirty WebP", assertNoResidualMetadata(dirtyWebp, "webp") !== null);
  check(
    "reports clean after stripping that WebP",
    assertNoResidualMetadata(stripImageMetadata(dirtyWebp).data, "webp") === null,
  );

  // Every real fixture must come out clean by the verifier's own reckoning.
  const fixtureDir = join(process.cwd(), "public", "feed");
  for (const name of readdirSync(fixtureDir).filter((f) => f.endsWith(".png")).slice(0, 4)) {
    const raw = readFileSync(join(fixtureDir, name));
    const format = detectFormat(raw);
    if (format !== "jpeg" && format !== "png" && format !== "webp") continue;
    const stripped = stripImageMetadata(raw);
    check(
      `${name}: verifier reports clean after strip`,
      assertNoResidualMetadata(stripped.data, format) === null,
      assertNoResidualMetadata(stripped.data, format),
    );
  }
}

console.log(
  failures === 0
    ? "\nAll metadata-stripping checks passed."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
