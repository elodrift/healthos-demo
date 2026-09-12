/**
 * Tests for the Live-mode boundary helpers.
 *
 * These cover the timezone conversion specifically, because it is the one piece
 * of arithmetic here that is wrong in a silent way: a UTC-formatted wake time
 * looks perfectly plausible while being an hour or more off, and every meal
 * time in the day is derived from it.
 */

import {
  localTimeFromInstant,
  parseOffsetMinutes,
  pickMainSleep,
} from "../lib/live/build-day";
import type { WhoopSleep } from "../lib/whoop/client";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`✗ ${name}\n    expected ${e}\n    actual   ${a}`);
    failures++;
  }
}

/* ---------------------------------------------------------- offsets ------- */

check("offset +01:00", parseOffsetMinutes("+01:00"), 60);
check("offset -05:00", parseOffsetMinutes("-05:00"), -300);
check("offset without colon", parseOffsetMinutes("-0500"), -300);
check("offset hours only", parseOffsetMinutes("+02"), 120);
check("offset Z is zero", parseOffsetMinutes("Z"), 0);
check("offset half-hour zone", parseOffsetMinutes("+05:30"), 330);
check("offset 45-minute zone", parseOffsetMinutes("+05:45"), 345);
check("offset null", parseOffsetMinutes(null), null);
check("offset empty string", parseOffsetMinutes(""), null);
check("offset garbage", parseOffsetMinutes("banana"), null);
check("offset missing sign", parseOffsetMinutes("01:00"), null);
check("offset impossible hours", parseOffsetMinutes("+99:00"), null);

/* ------------------------------------------------- local wake time -------- */

// The core case: 05:40 UTC in a +01:00 zone is a 06:40 local wake-up. Reporting
// 05:40 would shift the whole plan an hour earlier.
check(
  "applies positive offset",
  localTimeFromInstant("2026-08-07T05:40:00.000Z", "+01:00"),
  "06:40",
);
check(
  "applies negative offset",
  localTimeFromInstant("2026-08-07T11:15:00.000Z", "-05:00"),
  "06:15",
);
check(
  "Z offset is identity",
  localTimeFromInstant("2026-08-07T06:40:00.000Z", "Z"),
  "06:40",
);
// Crossing midnight backwards: 00:30 UTC at -05:00 is 19:30 the previous day.
check(
  "wraps backwards past midnight",
  localTimeFromInstant("2026-08-07T00:30:00.000Z", "-05:00"),
  "19:30",
);
// And forwards: 23:30 UTC at +02:00 is 01:30 the next day.
check(
  "wraps forwards past midnight",
  localTimeFromInstant("2026-08-07T23:30:00.000Z", "+02:00"),
  "01:30",
);
check(
  "half-hour zone",
  localTimeFromInstant("2026-08-07T01:10:00.000Z", "+05:30"),
  "06:40",
);
check("unparseable instant", localTimeFromInstant("not-a-date", "+01:00"), null);
check(
  "missing offset is refused, not assumed UTC",
  localTimeFromInstant("2026-08-07T05:40:00.000Z", null),
  null,
);

/* ------------------------------------------------------ main sleep -------- */

function sleep(id: string, end: string, nap: boolean): WhoopSleep {
  return {
    id,
    start: end,
    end,
    timezone_offset: "+01:00",
    nap,
    score_state: "SCORED",
  };
}

check(
  "picks latest non-nap sleep",
  pickMainSleep([
    sleep("a", "2026-08-06T05:00:00.000Z", false),
    sleep("b", "2026-08-07T06:00:00.000Z", false),
  ])?.id,
  "b",
);
// A 20-minute afternoon nap is the most recent sleep record but is not
// last night; reading it as such would report a wake time of ~15:00.
check(
  "ignores naps even when more recent",
  pickMainSleep([
    sleep("night", "2026-08-07T06:00:00.000Z", false),
    sleep("nap", "2026-08-07T14:20:00.000Z", true),
  ])?.id,
  "night",
);
check("no records", pickMainSleep([]), null);
check("only naps", pickMainSleep([sleep("nap", "2026-08-07T14:20:00.000Z", true)]), null);

if (failures > 0) {
  console.error(`\n${failures} live-day check(s) failed.`);
  process.exit(1);
}
console.log("All live-day checks passed.");
