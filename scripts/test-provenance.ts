/**
 * Offline test for findNakedNumbers.
 *
 * No database, no network, no browser — it runs in CI where `npm run verify`
 * lives. This is the copy of the guard that is allowed to fail the build; the
 * `jsonPrivate` hook only warns.
 */
import { findNakedNumbers, formatNakedNumbers } from "../lib/provenance/naked-numbers";
import {
  LABEL_WITH_SERVING,
  LABEL_NO_SERVING,
  RECOGNIZED,
  UNAVAILABLE,
} from "../tests/captions/payloads";

type Case = {
  name: string;
  payload: unknown;
  /** Paths expected to be flagged. Empty means the payload must come back clean. */
  expect: string[];
};

const cases: Case[] = [
  // ---- must be flagged -----------------------------------------------------
  {
    name: "a bare macro block with no provenance at all",
    payload: { kcal: 612, proteinG: 31, carbsG: 58, fatG: 24 },
    expect: ["kcal", "proteinG", "carbsG", "fatG"],
  },
  {
    name: "one meal in a list forgets its provenance",
    payload: {
      meals: [
        { label: "porridge", proteinG: 12, confidence: "HIGH", source: "barcode" },
        { label: "stew", proteinG: 31 },
      ],
    },
    expect: ["meals[1].proteinG"],
  },
  {
    name: "provenance on the envelope does not cover the rows beneath it",
    payload: {
      confidence: "MEDIUM",
      items: [{ kcal: 400 }, { kcal: 550 }],
    },
    expect: ["items[0].kcal", "items[1].kcal"],
  },
  {
    name: "a nested total buried three levels down",
    payload: { day: { totals: { summary: { kcal: 2100 } } } },
    expect: ["day.totals.summary.kcal"],
  },

  // ---- must be clean -------------------------------------------------------
  {
    name: "an estimate expressed as a range",
    payload: { proteinG: 33, low: 30, high: 36, estimated: true },
    expect: [],
  },
  {
    name: "a weighed barcode scan",
    payload: { grams: 150, weighed: true, source: "barcode", confidence: "HIGH" },
    expect: [],
  },
  {
    name: "the WHOOP planner naming its basis",
    payload: { kcalBurned: 2456, basis: "whoop:cycle", measured: true },
    expect: [],
  },
  {
    name: "pagination numbers are not nutrition claims",
    payload: { meta: { page: 2, pageSize: 20, total: 41 }, items: [] },
    expect: [],
  },
  {
    name: "a cyclic payload does not hang the walker",
    payload: (() => {
      // Carries real provenance (`estimated`) so the case tests only what it
      // claims to: termination. It previously leaned on `source`, which is no
      // longer accepted as provenance, and so began failing for an unrelated
      // reason — the assertion drifted away from the behaviour it was named for.
      const a: Record<string, unknown> = { grams: 100, estimated: true };
      a.self = a;
      return a;
    })(),
    expect: [],
  },

  /*
   * ---- the guard's own blind spot, asserted so it stays documented ---------
   *
   * This payload is a lie: an eyeballed portion claiming HIGH confidence. The
   * walker passes it, because presence of provenance is all it can see. It is
   * recorded here as a PASSING expectation so that nobody reads a green
   * provenance run as proof of honesty — that job belongs to tests/captions
   * and to the barcode "I weighed this" gate.
   */
  {
    name: "BLIND SPOT: a false confidence claim passes structural checking",
    payload: { proteinG: 31, confidence: "HIGH", weighed: false },
    expect: [],
  },

  /*
   * ---- the real fixtures, imported not retyped -----------------------------
   *
   * These are the same objects the caption suite renders, typed as the real
   * `BarcodeLookup` / `RecognitionResult` unions. Importing them rather than
   * hand-copying a lookalike is the point: a retyped fixture drifts from the API
   * it imitates and then passes while the live payload breaks. The first version
   * of this file hand-copied the recognizer shape and so tested a replica.
   *
   * These four cases exist because running the walker over them found two real
   * defects that every synthetic case had missed.
   */

  /*
   * Was a LIVE FALSE POSITIVE: 3 fields flagged on a correctly-provenanced
   * payload, in dev, on every successful barcode lookup. The macros sit inside
   * `per100g` while `portionBasis` sits on the parent, so the guard was asking
   * for a sibling that could not exist. Fixed by treating a basis-declaring
   * container as its own provenance — "per 100 g" states what the numbers mean.
   */
  {
    name: "REAL FIXTURE: label with a published serving is clean",
    payload: LABEL_WITH_SERVING,
    expect: [],
  },
  {
    name: "REAL FIXTURE: label with no serving is clean",
    payload: LABEL_NO_SERVING,
    expect: [],
  },

  /*
   * Still a real finding, unchanged by the fixes: `confidence` sits on the
   * envelope and neither `items[]` nor `totals` carries per-row provenance, so
   * a per-photo confidence is doing duty for six separate claims.
   *
   * Asserted as EXPECTED-FLAGGED rather than whitelisted. Changing the payload
   * shape is product code and out of scope here, so this pins the finding: it
   * fails loudly if someone "fixes" it by loosening the walker instead of adding
   * provenance to the rows.
   */
  {
    name: "REAL FIXTURE / FINDING: recognizer rows carry no per-row provenance",
    payload: RECOGNIZED,
    expect: [
      "items[0].kcal",
      "items[0].protein",
      "items[0].carbs",
      "items[0].fat",
      "totals.kcal",
      "totals.protein",
      "totals.carbs",
      "totals.fat",
    ],
  },
  {
    name: "REAL FIXTURE: an unavailable estimate has no numbers to guard",
    payload: UNAVAILABLE,
    expect: [],
  },

  /*
   * The narrowed container rule must not become "inherit from any ancestor",
   * which is the whole thing the walker exists to refuse. Nesting one level
   * deeper under a basis-declaring container gets no free pass.
   *
   * There are TWO axes to nest along, and the object one below was the only one
   * tested at first. That is how the array leak survived review: a case can pin a
   * rule on one axis and say nothing about the other.
   */
  {
    name: "a basis-declaring container does not shelter objects nested below it",
    payload: { per100g: { kcal: 539, breakdown: { proteinG: 6 } } },
    expect: ["per100g.breakdown.proteinG"],
  },

  /*
   * The same rule down the array axis. This was a REAL ESCAPE, not a hypothetical:
   * the array branch forwarded the basis flag unchanged, and because an array has
   * no key of its own to reset the flag against, it rode indefinitely. Before the
   * fix `per100g: [[{...}]]` came back completely clean, at any depth.
   */
  {
    name: "a basis-declaring container does not shelter arrays nested below it",
    payload: { per100g: [[{ kcal: 500, carbG: 30 }]] },
    expect: ["per100g[0][0].kcal", "per100g[0][0].carbG"],
  },
  {
    name: "the array escape does not reopen at greater depth",
    payload: { per100g: [[[{ kcal: 500 }]]] },
    expect: ["per100g[0][0][0].kcal"],
  },

  /*
   * The other side of the fix, so it cannot be over-corrected into uselessness:
   * ONE array layer is legitimate. `per100g: [{...}]` is just how the rows are
   * held, and the key above them still describes them. If this ever starts
   * flagging, the guard has begun crying wolf on correct payloads — the failure
   * mode that gets a guard switched off.
   *
   * Uses `per100g` deliberately: a key the app actually ships. This case first
   * used `perServing`, which turned out to have zero call sites — so it was
   * proving the rule held for a shape that does not exist.
   */
  {
    name: "a single array layer under a basis-declaring container stays clean",
    payload: { per100g: [{ kcal: 500, carbG: 30 }] },
    expect: [],
  },

  /*
   * `per100g` is the ONLY sheltering key, and this case is what holds the set to
   * one. Deleting `per100ml` from the set previously broke nothing — all 20 cases
   * stayed green — which is exactly why it survived three rounds of review: dead
   * code defended by an unchecked assumption ("a drink will arrive under
   * per100ml"), with no test to contradict it.
   *
   * `parseProduct` reads the hardcoded `*_100g` Open Food Facts fields and always
   * writes `per100g`, solid or liquid alike; `LABEL_NO_SERVING` is already a
   * liquid shipping under `per100g`. So no `per100ml` payload exists here, and
   * until one does its numbers are naked.
   *
   * If someone adds real `per100ml` support, this case fails and asks for the
   * payload as evidence. That is the intent — a tripwire against re-widening the
   * rule on a hunch, not a claim that `per100ml` is wrong in general.
   */
  {
    name: "per100ml does not shelter — no such payload exists in this codebase",
    payload: { per100ml: { kcal: 42, carbG: 11 } },
    expect: ["per100ml.kcal", "per100ml.carbG"],
  },

  /*
   * `source` alone is not provenance. Per CONTEXT.md it is one of two *inputs*
   * that decide `estimated`; on its own it names an origin without saying
   * whether the figure was measured or guessed.
   */
  {
    name: "source without estimated or confidence is not provenance",
    payload: { grams: 45, source: "barcode" },
    expect: ["grams"],
  },

  /*
   * The exact spellings the app ships, guarded outside a basis-declaring
   * container so the dictionary itself is what is under test.
   *
   * This case exists because mutation testing found the gap: deleting `carbg`
   * from NUTRITION_FIELDS left all sixteen other cases passing. The label
   * fixtures are clean either way now that `per100g` declares its own basis, and
   * the recognizer fixture spells it `carbs` — so nothing anywhere proved that a
   * bare `carbG` is guarded at all. A fix with no failing test behind it is a
   * fix that can silently regress.
   */
  {
    name: "carbG and servingG — the shipped spellings — are guarded",
    payload: { kcal: 612, proteinG: 31, carbG: 58, fatG: 24, servingG: 30 },
    expect: ["kcal", "proteinG", "carbG", "fatG", "servingG"],
  },
];

let failures = 0;

for (const c of cases) {
  const found = findNakedNumbers(c.payload);
  const paths = found.map((f) => f.path).sort();
  const want = [...c.expect].sort();
  const ok = paths.length === want.length && paths.every((p, i) => p === want[i]);

  if (ok) {
    console.log(`  ok    ${c.name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${c.name}`);
    console.error(`        expected: [${want.join(", ")}]`);
    console.error(`        actual:   [${paths.join(", ")}]`);
    if (found.length) console.error(formatNakedNumbers(found));
  }
}

console.log("");
if (failures > 0) {
  console.error(`provenance: ${failures} of ${cases.length} case(s) failed`);
  process.exit(1);
}
console.log(`provenance: all ${cases.length} cases passed`);
