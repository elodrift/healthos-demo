import type { Confidence, DaySummary, DemoEvent } from "@/lib/events";
import type { GoalMode, PersonaId } from "./personas";

export type Setup = { personaId: PersonaId; mode: GoalMode };

/** choice beat id -> chosen option id, accumulated as the player advances */
export type ScriptContext = {
  setup: Setup;
  choices: Record<string, string>;
};

export type RevisionRow = {
  label: string;
  from: number;
  to: number;
  unit: string;
  locked?: boolean;
};

export type CardSpec =
  | { type: "planned-variance"; tag: string; headline: string; body: string }
  | { type: "never-suspends"; tag: string; rules: string[]; body: string }
  | { type: "proposals"; items: string[] }
  | { type: "meal-push"; title: string; why: string }
  | {
      type: "target-revision";
      causeTag: string;
      rows: RevisionRow[];
      lockNote: string;
    }
  | { type: "morning-untouched"; caption: string; meals: string[] }
  | {
      type: "estimate";
      label: string;
      confidence: Confidence;
      kcalRange: [number, number];
      proteinRange: [number, number];
      note: string;
    }
  | { type: "evening-status"; tone: "amber" | "green"; label: string; body: string }
  | { type: "day-close"; summary: DaySummary };

export type BeatBase = {
  id: string;
  /** clock time — drives the scrubber and the engine feed timestamps */
  time: string;
  events?: DemoEvent[];
};

export type MessageBeat = BeatBase & {
  kind: "message";
  speaker: "user" | "healthos";
  text: string;
};

export type CardBeat = BeatBase & { kind: "card"; card: CardSpec };

export type ChoiceOption = {
  id: string;
  label: string;
  branch: (ctx: ScriptContext) => Beat[];
};

export type ChoiceBeat = BeatBase & { kind: "choice"; options: ChoiceOption[] };

export type CloseBeat = BeatBase & { kind: "close" };

export type Beat = MessageBeat | CardBeat | ChoiceBeat | CloseBeat;
