/**
 * Build a VALID png that carries GPS metadata, for end-to-end upload testing.
 *
 * Takes a real image from public/feed and injects eXIf + tEXt chunks after the
 * IHDR, with correct CRCs so the file still decodes. Uploading this through the
 * app proves the strip runs on the real request path, not just in unit tests.
 *
 * Run: npx tsx scripts/make-dirty-fixture.ts /tmp/dirty.png
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

const out = process.argv[2] ?? "/tmp/dirty.png";
const dir = join(process.cwd(), "public", "feed");
const source = readdirSync(dir).find((f) => f.endsWith(".png"));
if (!source) throw new Error("no png fixture found in public/feed");

const raw = readFileSync(join(dir, source));

// A little-endian TIFF header carrying one GPS IFD pointer. The exact tag
// layout does not need to be meaningful — what matters is that the bytes are
// present before the strip and absent after it.
const exif = Buffer.concat([
  Buffer.from("II", "latin1"),
  Buffer.from([0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
  Buffer.from([0x01, 0x00]),
  Buffer.from([0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  // Recognisable needle: coordinates as ASCII so a grep can confirm removal.
  Buffer.from("GPS:51.5007,-0.1246", "latin1"),
]);

const textData = Buffer.concat([
  Buffer.from("Comment", "latin1"),
  Buffer.from([0x00]),
  Buffer.from("Shot at 51.5007,-0.1246 on iPhone", "latin1"),
]);

// IHDR is always the first chunk: 8-byte signature + 25-byte IHDR.
const headerEnd = 8 + 25;
const dirty = Buffer.concat([
  raw.subarray(0, headerEnd),
  chunk("eXIf", exif),
  chunk("tEXt", textData),
  raw.subarray(headerEnd),
]);

writeFileSync(out, dirty);
console.log(`wrote ${out} (${dirty.length} bytes, from ${source})`);
console.log(`contains needle: ${dirty.includes(Buffer.from("51.5007"))}`);
