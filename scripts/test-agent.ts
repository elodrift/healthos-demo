/**
 * Verification for the agent's deterministic layer: lib/agent/nlu.ts and
 * lib/agent/respond.ts.
 *
 * The invariant that matters most is a safety one. DNA principle 12 requires
 * that overriding a hard medical rule be "refused and surfaced, never silently
 * done", and a language model cannot be relied on to refuse. So a medical
 * phrasing must be claimed by the matcher with a score above HANDOFF_THRESHOLD
 * — if it scores below, the route hands off to the model and the guarantee is
 * gone. That is the specific regression this file exists to catch.
 *
 * The second group guards §4.11: no reply may state a number the engine does not
 * hold. With no proposal the responder must explain the blocker rather than
 * substitute a plausible figure, and it must never call a floor a target —
 * clearing a 150g floor is a success, missing a 205g target is not.
 *
 * Pure functions only: no database, no session, no model, so this runs in CI.
 *
 * Run with: npm run test:agent
 */

import { classify, HANDOFF_THRESHOLD } from "../lib/agent/nlu";
import { respond } from "../lib/agent/respond";
import type { AgentSnapshot } from "../lib/agent/snapshot";
import type { DayProposal } from "../lib/planner/propose-day";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  pass  ${label}`);
  } else {
    failures++;
    console.log(
      `  FAIL  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`,
    );
  }
}

/**
 * A minimal proposal. Only the fields the responder reads are meaningful; the
 * rest satisfy the type. `proteinKind: "FLOOR"` is deliberate — the floor/target
 * distinction is asserted below.
 */
function proposalWith(over: Partial<DayProposal> = {}): DayProposal {
  const base = {
    wakeTime: "07:00",
    sleepTime: "23:00",
    trainingStart: null,
    trainingEnd: null,
    trainingType: null,
    slots: [],
    dayTarget: { proteinG: 165, proteinKind: "FLOOR", carbG: 240, kcal: 2400 },
    rationale: ["Recovery was 41%, so today is a floor rather than a push."],
    evidence: {},
    controlLevel: "MEDIUM",
  } as unknown as DayProposal;
  return { ...base, ...over };
}

const OK_SNAPSHOT: AgentSnapshot = {
  proposal: proposalWith(),
  unavailable: null,
  fromCache: false,
  logged: { proteinG: 62, carbG: 80, fatG: 20, kcal: 900, count: 2, anyEstimated: false },
  medicalNotes: null,
  day: "2026-08-07",
  dayFromFallback: false,
};

/** The engine having nothing real to say, for a nameable reason. */
const NO_GOAL_SNAPSHOT: AgentSnapshot = {
  proposal: null,
  unavailable: "NO_GOAL",
  fromCache: false,
  logged: { proteinG: 0, carbG: 0, fatG: 0, kcal: 0, count: 0, anyEstimated: false },
  medicalNotes: null,
  day: "2026-08-07",
  dayFromFallback: false,
};

console.log("classify() — medical questions never reach the model");

const MEDICAL_PHRASINGS = [
  "can I eat grapefruit on amlodipine",
  "is grapefruit safe with my blood pressure meds",
  "does red meat affect my uric acid",
  "is this ok with my medication",
];

for (const text of MEDICAL_PHRASINGS) {
  const intent = classify(text);
  // Both halves matter. Wrong kind = wrong branch; score at or below the
  // threshold = the route hands off to the LLM, which is the failure mode
  // principle 12 forbids.
  check(
    `claimed as medical_check: ${JSON.stringify(text)}`,
    intent.kind === "medical_check",
    intent,
  );
  check(
    `scores above handoff: ${JSON.stringify(text)}`,
    intent.score > HANDOFF_THRESHOLD,
    intent.score,
  );
}

console.log("\nrespond() — medical replies defer, never adjudicate");

for (const text of MEDICAL_PHRASINGS) {
  const reply = respond(classify(text), OK_SNAPSHOT);
  const lower = reply.text.toLowerCase();
  // Deferring language, and crucially never a verdict.
  const defers =
    lower.includes("doctor") || lower.includes("pharmacist") || lower.includes("will not");
  check(`defers: ${JSON.stringify(text)}`, defers, reply.text);
  check(`does not hand off: ${JSON.stringify(text)}`, reply.handoff !== true, reply);
}

console.log("\nrespond() — never invents numbers");

const remaining = classify("how much protein do I have left");
check("'protein left' is claimed", remaining.kind === "ask_remaining", remaining);

// With no proposal there is no target to quote, so any 3–4 digit gram/kcal
// figure would be fabricated.
{
  const reply = respond(remaining, NO_GOAL_SNAPSHOT);
  check(
    "no fabricated figure when the planner has nothing",
    !/\b\d{3,4}\s*(g|kcal)\b/i.test(reply.text),
    reply.text,
  );
  check("names the blocker (no goal)", /goal/i.test(reply.text), reply.text);
  check("marks itself degraded", reply.source === "degraded", reply.source);
}

// With a real proposal the engine's own number must appear, described correctly.
{
  const reply = respond(remaining, OK_SNAPSHOT);
  check("quotes the engine's protein figure", reply.text.includes("165"), reply.text);
  // proteinKind is FLOOR. Calling it a "target" misstates the contract.
  check("calls a floor a floor", /floor/i.test(reply.text), reply.text);
  check("does not call it a target", !/target/i.test(reply.text), reply.text);
}

// A total built from estimates is itself an estimate and must be hedged.
{
  const reply = respond(remaining, {
    ...OK_SNAPSHOT,
    logged: { ...OK_SNAPSHOT.logged, anyEstimated: true },
  });
  check("hedges an estimated total", /estimated/i.test(reply.text), reply.text);
}

// Cached numbers are stale numbers, and must say so.
{
  const reply = respond(remaining, { ...OK_SNAPSHOT, fromCache: true });
  check("flags cached data as stale", /stale|last stored/i.test(reply.text), reply.text);
}

console.log("\nclassify() — open-ended talk is left to the model");

// The complement of the safety rule: consequence-free chat should hand off, or
// the agent becomes a keyword bot that cannot hold a conversation.
for (const text of ["what should I cook tonight", "tell me about protein timing"]) {
  const intent = classify(text);
  const handsOff = intent.kind === "unknown" || intent.score <= HANDOFF_THRESHOLD;
  check(`hands off: ${JSON.stringify(text)}`, handsOff, intent);
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
