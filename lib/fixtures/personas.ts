import type { Targets } from "@/lib/events";

export type GoalMode = "strict" | "fast";

export type MedicalRule = { id: string; label: string };

export type PersonaId = "athletic-elevated-lipids" | "desk-recomposition";

export type Persona = {
  id: PersonaId;
  label: string;
  detail: string;
  displayName: string;
  medicalNeverSuspends: MedicalRule[];
  baselineTargets: Targets;
};

/** Provenance strings are the ones the brief prints on the payoff card. */
const baseProvenance = {
  protein_g: "floor set by your lipid panel",
  kcal: "maintenance minus a modest deficit",
  carbs_g: "training day",
  fat_max_g: "capped by your last LDL reading",
};

export const personas: Persona[] = [
  {
    id: "athletic-elevated-lipids",
    label: "Athletic, lipid markers elevated",
    detail: "Trains 5×/week · LDL flagged · uric acid watched",
    displayName: "Pat",
    medicalNeverSuspends: [
      { id: "grapefruit-amlodipine", label: "Grapefruit × Amlodipine" },
      { id: "red-meat-uric-acid", label: "Red meat ≤ 2 / week — uric acid" },
    ],
    baselineTargets: {
      kcal: 2700,
      protein_g: 185,
      carbs_g: 320,
      fat_max_g: 90,
      provenance: baseProvenance,
    },
  },
  {
    id: "desk-recomposition",
    label: "Desk job, wants recomposition",
    detail: "Trains 3×/week · LDL flagged · sedentary baseline",
    displayName: "Pat",
    medicalNeverSuspends: [
      { id: "grapefruit-amlodipine", label: "Grapefruit × Amlodipine" },
      { id: "red-meat-uric-acid", label: "Red meat ≤ 2 / week — uric acid" },
    ],
    baselineTargets: {
      kcal: 2700,
      protein_g: 185,
      carbs_g: 320,
      fat_max_g: 90,
      provenance: baseProvenance,
    },
  },
];

export const defaultPersonaId: PersonaId = "athletic-elevated-lipids";

export function personaById(id: PersonaId): Persona {
  return personas.find((p) => p.id === id) ?? personas[0];
}

export const goalLabel = "Lean recomposition · 16 weeks";

export const goalModes: Array<{ id: GoalMode; label: string; detail: string }> = [
  {
    id: "strict",
    label: "Strict & sustainable",
    detail: "follows your biomarkers strictly; slower, durable",
  },
  {
    id: "fast",
    label: "Fast & aggressive",
    detail: "reaches the goal faster; accepts trade-offs",
  },
];

export const goalModeBadge: Record<GoalMode, string> = {
  strict: "STRICT & SUSTAINABLE",
  fast: "FAST & AGGRESSIVE",
};
