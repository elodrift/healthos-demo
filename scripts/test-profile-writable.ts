/**
 * Guard against planner inputs that no user can ever set.
 *
 * `carbTargetG` was read by the planner, typed, covered by passing tests, and
 * written by nothing in the application — so the WHOOP strain branch that
 * depends on it was unreachable for every real user, and the only trace line it
 * could ever emit was "read, but this day carries no gram-level carb target for
 * it to move". The unit tests could not catch it because they construct
 * `PlannerProfile` literals themselves, supplying the very field production
 * never supplies.
 *
 * This test closes that gap by comparing two things the type system cannot
 * relate: the fields `PlannerProfile` declares, and the fields the server
 * actions actually persist.
 *
 * It is deliberately bidirectional. `UNUSED_WEARABLE_SIGNALS` in
 * test-whoop-trace.ts only validates the fields it lists, so deleting an entry
 * makes that check pass vacuously. Here, a field on KNOWN_UNSETTABLE that has
 * since become settable is also a failure — the list is meant to shrink, and it
 * can only be trusted if it cannot silently rot in either direction.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

/**
 * Planner inputs with no write path yet, each with the user-visible consequence.
 *
 * These are real gaps, not exemptions: every one of them means a planner branch
 * that only ever runs on its fallback. Removing an entry here should happen in
 * the same change that adds the form field.
 */
const KNOWN_UNSETTABLE: Record<string, string> = {
  /*
    Empty, and that is the point.

    This list held five entries. `carbTargetG` came off it when the carb field
    shipped; the last four — typicalWakeTime, typicalSleepTime, mealsPerDay,
    kcalTarget — came off when the goal form grew a calories field and a "your
    usual day" fieldset. Every planner input is now reachable from the UI.

    The bidirectional check is what forces this to stay true: a new planner field
    with no write path fails immediately, and re-adding an entry here that IS
    settable also fails. Do not add an entry to silence a failure — add the form
    field, or accept that the feature is dead for real users.
  */
};

const root = join(__dirname, "..");

/* --- the fields the planner declares it consumes ------------------------- */
const plannerSrc = readFileSync(
  join(root, "lib/planner/propose-day.ts"),
  "utf8",
);
const typeBlock = plannerSrc.match(
  /export type PlannerProfile = \{([\s\S]*?)\n\};/,
);
check("PlannerProfile type block is parseable", typeBlock !== null);

const declared = [...(typeBlock?.[1] ?? "").matchAll(/^\s{2}(\w+)\??:/gm)].map(
  (m) => m[1],
);
check("found planner profile fields", declared.length > 0, `${declared.length}`);

/* --- the fields the server actions actually persist ---------------------- */
function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// Writes live in server actions; pages and components only read the profile, so
// scanning those too would let a read masquerade as a write and defeat the test.
const actionSrc = collect(join(root, "app/actions"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

check("server action sources were read", actionSrc.length > 0);

/* --- compare, in both directions ---------------------------------------- */
for (const field of declared) {
  const written = new RegExp(`\\b${field}\\b`).test(actionSrc);
  const listed = field in KNOWN_UNSETTABLE;

  if (listed) {
    // The shrink-only direction: if this now has a write path, the list is
    // understating the app and must be updated.
    check(
      `${field}: still genuinely unsettable (remove from KNOWN_UNSETTABLE once wired)`,
      !written,
      written
        ? `${field} IS now persisted by a server action — delete its KNOWN_UNSETTABLE entry`
        : undefined,
    );
  } else {
    check(
      `${field}: has a write path`,
      written,
      written
        ? undefined
        : `no server action persists ${field}, so every planner branch reading it runs on its fallback for all users. Add a form field, or document it in KNOWN_UNSETTABLE.`,
    );
  }
}

/* --- the list may not name fields the planner does not read -------------- */
for (const field of Object.keys(KNOWN_UNSETTABLE)) {
  check(
    `KNOWN_UNSETTABLE.${field} is a real planner input`,
    declared.includes(field),
    "stale entry: the planner no longer reads this field",
  );
}

/* --- copy may not promise an edit the app cannot perform ----------------- */
{
  /*
    The wake-time fallback tells the user their wake time is settable. That
    sentence was removed once, when nothing could write `typicalWakeTime`, and
    restored when the goal form shipped the field.

    Asserting only "no promise while unsettable" would now pass vacuously,
    because KNOWN_UNSETTABLE is empty — so this asserts the promise BOTH ways:
    the invitation must be present exactly when a write path exists. That means
    deleting the form field without touching the copy fails here, which is the
    regression this is really guarding against.
  */
  const invites = /and the day re-plans around it/.test(plannerSrc);
  const wakeWritable = /\btypicalWakeTime\b/.test(actionSrc);

  check(
    "wake-time copy matches reality (invitation present iff the field is writable)",
    invites === wakeWritable,
    invites
      ? "planner copy invites the user to set their wake time, but no server action persists typicalWakeTime"
      : "typicalWakeTime is writable, but the fallback copy never tells the user they can set it",
  );
}

console.log(
  failures === 0
    ? `\nAll profile-writability assertions passed (${Object.keys(KNOWN_UNSETTABLE).length} known gap(s) documented).\n`
    : `\n${failures} assertion(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
