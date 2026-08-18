/**
 * Offline test for findNakedNumbers.
 *
 * No database, no network, no browser — it runs in CI where `npm run verify`
 * lives. This is the copy of the guard that is allowed to fail the build; the
 * `jsonPrivate` hook only warns.
 */
import { findNakedNumbers, formatNakedNumbers } from "../lib/provenance/naked-numbers";

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
      const a: Record<string, unknown> = { grams: 100, source: "barcode" };
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
   * ---- a real finding from the shipped recognizer shape --------------------
   *
   * This is `RecognitionResult` as `lib/food/recognize.ts` actually returns it:
   * one `confidence` on the envelope, none on `items[]` or `totals`. Running the
   * walker over the live shapes flagged 8 fields here.
   *
   * It is asserted as EXPECTED-FLAGGED rather than quietly whitelisted, because
   * it is exactly the case the rule was written for: a per-photo confidence says
   * nothing about which of six items is the guess. Changing the payload shape is
   * product code and out of scope for a testing PR — this test pins the finding
   * so it stays visible and fails loudly if someone "fixes" it by loosening the
   * walker instead of adding provenance to the rows.
   */
  {
    name: "REAL FINDING: recognizer items and totals carry no per-row provenance",
    payload: {
      kind: "recognized",
      items: [{ name: "beef stew", portion: "1 bowl", kcal: 480, protein: 28, carbs: 52, fat: 16 }],
      totals: { kcal: 480, protein: 28, carbs: 52, fat: 16 },
      confidence: "medium",
      caveat: "The broth's oil is hard to judge from the photo.",
      model: "stub",
    },
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
