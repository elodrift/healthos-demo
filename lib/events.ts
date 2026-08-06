// The whole data model (DEMO_SPEC.md §3). No engine logic lives here — only
// shapes. Every value that flows through these types is authored in
// lib/fixtures/**, never computed by a ported algorithm.

export type Slot = "breakfast" | "lunch" | "dinner" | "snack" | "unplanned";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Present when the point value above is a midpoint of an honest range
   *  (confidence MEDIUM/LOW) rather than a confirmed number. */
  kcal_range?: [number, number];
  protein_range?: [number, number];
};

export type Targets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_max_g: number;
  /** e.g. "protein floor ← lipid profile". Provenance is shown, never a bare number. */
  provenance: Record<string, string>;
};

export type DaySummary = {
  known: string[];
  uncertain: string[];
  whatMattered: string[];
};

export type DemoEvent =
  | { t: "SESSION_OPENED"; targets: Targets; cause: "persona_baseline" }
  | {
      t: "FOOD_LOGGED";
      slot: Slot;
      label: string;
      macros: Macros;
      confidence: Confidence;
      snapshotVersion: number;
    }
  | { t: "TRAINING_CHANGED"; change: "skipped" | "harder" | "different" }
  | {
      t: "TARGETS_REVISED";
      targets: Targets;
      causeEventIdx: number;
      reason: string;
    }
  | { t: "DAY_CLOSED"; summary: DaySummary };

export type FoodLoggedEvent = Extract<DemoEvent, { t: "FOOD_LOGGED" }>;
export type TargetsRevisedEvent = Extract<DemoEvent, { t: "TARGETS_REVISED" }>;
