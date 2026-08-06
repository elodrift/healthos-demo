import type { Persona } from "./types";

// Slice 1 ships one persona, one goal mode (DEMO_SPEC.md §4). The medical
// NEVER-SUSPENDS rules and the 48g / 620kcal breakfast are taken verbatim
// from the journey frames; everything else on this object is invented to
// give the reducer's Targets a whole shape and is marked below.
export const athleticElevatedLipids: Persona = {
  id: "athletic-elevated-lipids",
  label: "Athletic, lipid markers elevated",
  displayName: "Pat",
  goalMode: "strict",
  medicalNeverSuspends: [
    {
      id: "grapefruit-amlodipine",
      label: "Grapefruit × Amlodipine",
      detail: "CYP3A4 interaction — grapefruit raises amlodipine plasma levels",
    },
    {
      id: "red-meat-uric-acid",
      label: "Red meat ≤ 2/week — uric acid",
      detail: "purine load — uric acid flagged on the last blood panel",
    },
  ],
  baselineTargets: {
    kcal: 2700,
    protein_g: 185,
    // [ASSUMPTION] carbs_g / fat_max_g / provenance: the frames only ever
    // render the protein and kcal bars. These fill out the Targets shape
    // without contradicting anything a frame shows.
    carbs_g: 260,
    fat_max_g: 90,
    provenance: {
      protein_g:
        "protein floor ← lipid profile (a higher satiety protein target curbs LDL-raising snacking) + training load",
      kcal: "maintenance − a modest deficit ← recomposition goal at current activity level",
      carbs_g: "performance carb allowance ← training frequency, kept clear of the lipid ceiling",
      fat_max_g: "capped ← elevated LDL on the last blood panel",
    },
  },
};
