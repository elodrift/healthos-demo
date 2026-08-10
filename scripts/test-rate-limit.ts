/**
 * Assertions for lib/rate-limit.ts and lib/http.ts.
 *
 * Same shape as the existing test-*.ts scripts: plain assertions, no runner, no
 * network. These two modules are pure and deterministic, which makes them the
 * cheapest things in the repo to pin down — and a limiter that is off by one is
 * a limiter that either bans a real user or lets a loop through.
 */

import { BUCKETS, checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { jsonPrivate } from "@/lib/http";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nlib/rate-limit.ts");

// A fresh key is allowed, and reports the right amount of headroom.
const first = checkRateLimit("chat", "user-a");
check("first request is allowed", first.ok);
check(
  "remaining counts down from the bucket max",
  first.remaining === BUCKETS.chat.max - 1,
  `expected ${BUCKETS.chat.max - 1}, got ${first.remaining}`,
);

// Exhausting the window blocks, and only at the boundary — not before it.
for (let i = 1; i < BUCKETS.chat.max; i++) checkRateLimit("chat", "user-a");
const atLimit = checkRateLimit("chat", "user-a");
check("request number max+1 is refused", !atLimit.ok);
check(
  "a refusal carries a positive Retry-After",
  typeof atLimit.retryAfter === "number" && atLimit.retryAfter > 0,
  `got ${String(atLimit.retryAfter)}`,
);
check("a refusal reports no remaining budget", atLimit.remaining === 0);

// Keys are independent. Without this, one heavy user throttles everyone.
check("a different key is unaffected", checkRateLimit("chat", "user-b").ok);

// Buckets are independent. Without this, chatting would consume the barcode
// budget, which is the allowance protecting a third-party API.
check("a different bucket is unaffected", checkRateLimit("barcode", "user-a").ok);

// The barcode bucket must stay under Open Food Facts' ~15/min per-IP budget,
// because every request from this app leaves on a shared Vercel egress IP.
check(
  "the barcode bucket sits below the Open Food Facts per-IP budget",
  BUCKETS.barcode.max < 15,
  `barcode max is ${BUCKETS.barcode.max}`,
);

const limited = tooManyRequests("slow down", 30);
check("tooManyRequests returns 429", limited.status === 429);
check("tooManyRequests sets Retry-After", limited.headers.get("Retry-After") === "30");
check(
  "tooManyRequests defaults Retry-After when none is given",
  tooManyRequests("x", undefined).headers.get("Retry-After") === "60",
);

console.log("\nlib/http.ts");

const res = jsonPrivate({ meals: [] });
check("jsonPrivate is 200 by default", res.status === 200);
check(
  "jsonPrivate forbids storing the response anywhere",
  res.headers.get("Cache-Control") === "private, no-store",
  `got ${String(res.headers.get("Cache-Control"))}`,
);
check("jsonPrivate sets a JSON content type", res.headers.get("Content-Type") === "application/json");
check("jsonPrivate sets nosniff", res.headers.get("X-Content-Type-Options") === "nosniff");
check("jsonPrivate honours an explicit status", jsonPrivate({}, { status: 401 }).status === 401);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
