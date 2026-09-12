/**
 * The payloads that produced the caption bugs.
 *
 * These are typed as the real `RecognitionResult` and `BarcodeLookup` unions, not
 * as loose object literals, so `npm run typecheck` proves each fixture is a shape
 * the network can actually return. A fixture that drifts from the API it imitates
 * is worse than no fixture: it passes while the real payload breaks.
 *
 * Standing rule 6: captions are tested by asserting the rendered sentence, never
 * by reading the component. Nothing in this file contains expected copy — the
 * expectations live in the spec, and every one of them is read out of the DOM.
 */

import type { BarcodeLookup } from "@/lib/food/barcode";
import type { RecognitionResult } from "@/lib/food/recognize";

/** A normal, successful read. The control case for every "did it claim an estimate" assertion. */
export const RECOGNIZED: RecognitionResult = {
  kind: "recognized",
  items: [
    {
      name: "boat noodles",
      portion: "one medium bowl",
      kcal: 480,
      protein: 28,
      carbs: 52,
      fat: 16,
    },
  ],
  totals: { kcal: 480, protein: 28, carbs: 52, fat: 16 },
  confidence: "medium",
  caveat: "The broth's oil is hard to judge from the photo.",
  model: "google/gemini-2.5-flash",
};

/**
 * The estimator could not answer at all.
 *
 * CLAUDE.md §3: the live equivalent of the deleted `tightestVenue()` returning
 * null is `recognize.ts` returning `unavailable` rather than a number it cannot
 * stand behind. The bug this guards is the UI filling the macro fields anyway.
 */
export const UNAVAILABLE: RecognitionResult = { kind: "unavailable" };

/** The model answered with nonsense past `LIMITS`. Same class of bug as `unavailable`. */
export const IMPLAUSIBLE: RecognitionResult = {
  kind: "implausible",
  reason: "That came back as 41,000 kcal, which cannot be right.",
};

/** Not food at all. There is nothing to estimate, and the UI must not pretend otherwise. */
export const NOT_FOOD: RecognitionResult = { kind: "not-food" };

/**
 * A packet that publishes a serving size.
 *
 * `portionBasis: "MANUFACTURER"` means a default *exists* — which is exactly when
 * the laundering bug is available: prefill their serving, let it be accepted
 * unread, and the result reads as though the user measured it.
 */
export const LABEL_WITH_SERVING: Extract<BarcodeLookup, { kind: "found" }> = {
  kind: "found",
  barcode: "3017620422003",
  name: "Hazelnut spread",
  brand: "Test Brand",
  per100g: { kcal: 539, proteinG: 6, carbG: 57, fatG: 31 },
  servingG: 15,
  servingLabel: "1 portion (15 g)",
  portionBasis: "MANUFACTURER",
};

/** The common case: nothing published, so there is no portion to suggest. */
export const LABEL_NO_SERVING: Extract<BarcodeLookup, { kind: "found" }> = {
  kind: "found",
  barcode: "5000112637922",
  name: "Sparkling water",
  brand: null,
  per100g: { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
  servingG: null,
  servingLabel: null,
  portionBasis: "UNKNOWN",
};

/** Named so a failing test says which payload broke, not just which index. */
export const RECOGNITION_FIXTURES = {
  recognized: RECOGNIZED,
  unavailable: UNAVAILABLE,
  implausible: IMPLAUSIBLE,
  "not-food": NOT_FOOD,
} satisfies Record<string, RecognitionResult>;

export type RecognitionFixtureName = keyof typeof RECOGNITION_FIXTURES;

export const LABEL_FIXTURES = {
  "with-serving": LABEL_WITH_SERVING,
  "no-serving": LABEL_NO_SERVING,
} satisfies Record<string, Extract<BarcodeLookup, { kind: "found" }>>;

export type LabelFixtureName = keyof typeof LABEL_FIXTURES;
