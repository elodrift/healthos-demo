// Diagnosis / engine-reason copy. Cause is always shown (DEMO_SPEC.md §3),
// rendered calm — never guilt (PRODUCT_DNA.md principle 10).

import type { DemoEvent, Macros } from "@/lib/events";
import type { MealDiagnosis } from "@/lib/reducer";

export function reasonFor(event: DemoEvent): string {
  switch (event.t) {
    case "SESSION_OPENED":
      return "Baseline loaded from persona — targets carry provenance, not bare numbers.";
    case "FOOD_LOGGED":
      return event.confidence === "HIGH"
        ? `${event.label} logged at HIGH confidence — exact macros, scored against today's opening targets.`
        : `${event.label} logged at ${event.confidence} confidence from a photo — a range shown, never a false point value.`;
    case "TRAINING_CHANGED":
      return "Training change recorded — the rest of today's plan recomputes from here.";
    case "TARGETS_REVISED":
      return event.reason;
    case "DAY_CLOSED":
      return "Day closed — known, uncertain, and what-mattered captured without re-scoring anything already eaten.";
  }
}

export const diagnosisLabel: Record<MealDiagnosis, string> = {
  on_track: "on track",
  over_by_choice: "over — by choice",
  over_by_revision: "over — plan changed, not overeating",
  uncertain: "uncertain — estimate, not a score",
};

export function closingMessage(remaining: Macros): string {
  return `Tonight: about ${Math.round(remaining.protein_g)}g protein and up to ${Math.round(
    remaining.kcal,
  )} kcal left, no cutoff. Breakfast still counts exactly as logged — nothing about it gets rescored.`;
}
