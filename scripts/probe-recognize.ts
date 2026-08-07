/**
 * Manual probe for food recognition. NOT part of `npm run verify` — it calls a
 * real model and costs money on every run.
 *
 *   npx tsx --env-file-if-exists=/vercel/share/.env.project scripts/probe-recognize.ts public/feed/boat-noodles.png
 */

import { readFileSync } from "node:fs";

import { recognizeFood } from "../lib/food/recognize";

const path = process.argv[2] ?? "public/feed/boat-noodles.png";
const bytes = readFileSync(path);
const mediaType = path.endsWith(".png") ? "image/png" : "image/jpeg";

console.log(`probing ${path} (${(bytes.length / 1000).toFixed(0)}kB)\n`);

async function main() {
  const started = Date.now();
  const result = await recognizeFood(bytes, mediaType);
  const elapsed = Date.now() - started;

  console.log(JSON.stringify(result, null, 2));
  console.log(`\n${elapsed}ms`);
}

void main();
