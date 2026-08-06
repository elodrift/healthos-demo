import type { Targets } from "@/lib/events";

export type GoalMode = "strict" | "fast";

export type MedicalRule = {
  id: string;
  label: string;
  detail: string;
};

export type Persona = {
  id: string;
  label: string;
  displayName: string;
  goalMode: GoalMode;
  medicalNeverSuspends: MedicalRule[];
  baselineTargets: Targets;
};
