/**
 * End-to-end probe for the meal-photo upload path.
 *
 * Posts a real file to the running dev server with a session cookie, then
 * fetches the stored blob back through the delivery route and asserts the GPS
 * needle is gone from the STORED bytes. This is the check that matters: unit
 * tests prove the stripper works, this proves it runs on the request path.
 *
 * Usage: node scripts/probe-upload.mjs <cookie> <file> [needle]
 */
const [, , cookie, filePath, needle = "51.5007"] = process.argv;
if (!cookie || !filePath) {
  console.error("usage: node scripts/probe-upload.mjs <cookie> <file> [needle]");
  process.exit(2);
}

const base = "http://localhost:3000";
const { readFileSync } = await import("node:fs");
const { basename } = await import("node:path");

const bytes = readFileSync(filePath);
console.log(`source: ${filePath} (${bytes.length} bytes)`);
console.log(`source contains needle "${needle}": ${bytes.includes(Buffer.from(needle))}`);

const form = new FormData();
form.set("file", new Blob([bytes], { type: "image/png" }), basename(filePath));

const res = await fetch(`${base}/api/meal-photo/upload`, {
  method: "POST",
  headers: { Cookie: cookie },
  body: form,
});

const text = await res.text();
console.log(`\nupload status: ${res.status}`);
console.log(`upload body: ${text.slice(0, 500)}`);

if (!res.ok) process.exit(1);

const json = JSON.parse(text);
console.log(`\nremoved: ${JSON.stringify(json.removed)}`);
console.log(`bytes: ${json.bytesBefore} -> ${json.bytesAfter}`);

// Fetch the stored object back and inspect the actual persisted bytes.
const fetchRes = await fetch(`${base}/api/meal-photo?pathname=${encodeURIComponent(json.pathname)}`, {
  headers: { Cookie: cookie },
});
console.log(`\ndelivery status: ${fetchRes.status}`);
if (!fetchRes.ok) {
  console.log(`delivery body: ${(await fetchRes.text()).slice(0, 300)}`);
  process.exit(1);
}

const stored = Buffer.from(await fetchRes.arrayBuffer());
const leaked = stored.includes(Buffer.from(needle));
console.log(`stored size: ${stored.length}`);
console.log(`stored still valid png: ${stored.subarray(1, 4).toString("latin1") === "PNG"}`);
console.log(`\nSTORED BYTES CONTAIN GPS NEEDLE: ${leaked}`);
console.log(leaked ? "FAIL — location data reached storage." : "PASS — location data did not reach storage.");

// Ownership: another user's prefix must not be readable.
const foreign = await fetch(`${base}/api/meal-photo?pathname=${encodeURIComponent("meal-photos/someone-else/x.png")}`, {
  headers: { Cookie: cookie },
});
console.log(`\nforeign pathname status (expect 404): ${foreign.status}`);

process.exit(leaked || foreign.status !== 404 ? 1 : 0);
