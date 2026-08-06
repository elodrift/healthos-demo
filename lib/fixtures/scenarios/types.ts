import type { DemoEvent } from "@/lib/events";

/** choice beat id -> chosen option id, accumulated as the player advances */
export type ScenarioContext = Record<string, string>;

export type MessageBeat = {
  id: string;
  kind: "message";
  speaker: "user" | "healthos";
  text: string;
  events?: DemoEvent[];
};

export type PlannedVarianceCardBeat = {
  id: string;
  kind: "planned-variance-card";
};

export type RebalancedRow = { label: string; value: string; detail: string };
export type RebalancedCardBeat = {
  id: string;
  kind: "rebalanced-card";
  rows: RebalancedRow[];
};

export type PhotoObject = {
  label: string;
  confidence: number;
  resolved: boolean;
  rect: { x: number; y: number; w: number; h: number };
};
export type PhotoCardBeat = {
  id: string;
  kind: "photo-card";
  timestamp: string;
  objectsDetected: number;
  unresolvedCount: number;
  objects: PhotoObject[];
};

export type TargetRevisionCardBeat = {
  id: string;
  kind: "target-revision-card";
  causeTag: string;
  events: DemoEvent[];
};

export type ChoiceOption = {
  id: string;
  label: string;
  branch: (ctx: ScenarioContext) => Beat[];
};
export type ChoiceBeat = {
  id: string;
  kind: "choice";
  prompt?: string;
  options: ChoiceOption[];
};

export type Beat =
  | MessageBeat
  | PlannedVarianceCardBeat
  | RebalancedCardBeat
  | PhotoCardBeat
  | TargetRevisionCardBeat
  | ChoiceBeat;
