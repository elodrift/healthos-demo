// The whole data model. No engine logic lives here — only shapes.
// Every value that flows through these types is authored in lib/fixtures/**.

export type Slot = "breakfast" | "lunch" | "dinner" | "snack" | "unplanned";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Present when the point value above is the midpoint of an honest range
   *  (confidence MEDIUM/LOW) rather than a confirmed number. */
  kcal_range?: [number, number];
  protein_range?: [number, number];
};

export type Targets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_max_g: number;
  /** e.g. "floor set by your lipid panel". Provenance is shown, never a bare number. */
  provenance: Record<string, string>;
};

export type DaySummary = {
  known: string[];
  uncertain: string[];
  whatMattered: string[];
};

export type DiagnosisCode =
  | "on_track"
  | "over_by_choice"
  | "over_by_revision"
  | "uncertain";

export type DemoEvent =
  | { t: "SESSION_OPENED"; targets: Targets; cause: string }
  | {
      t: "FOOD_LOGGED";
      slot: Slot;
      label: string;
      macros: Macros;
      confidence: Confidence;
      snapshotVersion: number;
      cause: string;
    }
  | { t: "TRAINING_CHANGED"; change: "skipped" | "harder" | "different"; cause: string }
  | {
      t: "TARGETS_REVISED";
      targets: Targets;
      causeEventIdx: number;
      version: number;
      reason: string;
      notes: string[];
    }
  | { t: "VARIANCE_PLANNED"; label: string; cause: string }
  | { t: "PROPOSAL_ACCEPTED"; label: string; cause: string }
  | { t: "DIAGNOSIS"; code: DiagnosisCode; causeChain: string[] }
  | { t: "DAY_CLOSED"; summary: DaySummary; cause: string };

export type EventType = DemoEvent["t"];

export type FoodLoggedEvent = Extract<DemoEvent, { t: "FOOD_LOGGED" }>;
export type TargetsRevisedEvent = Extract<DemoEvent, { t: "TARGETS_REVISED" }>;
export type DiagnosisEvent = Extract<DemoEvent, { t: "DIAGNOSIS" }>;
