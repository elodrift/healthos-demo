// The boat-trip scenario — S1 (planned variance). Copy is verbatim from
// design/journey-frames.pdf wherever a frame exists. The one deliberate
// deviation is the former "moved without asking" beat (frames 12-18):
// PRODUCT_DNA.md principle 12 says HealthOS proposes, never disposes, on
// anything it doesn't own — and a clinical draw date is exactly that. It is
// rewritten below as a proposal with an accept/decline chip.
//
// Everything past frame 28 ("your move — tap a reply") is new: the frames
// end mid-scene, waiting on the user's reply to two clarifying questions.
// Slice 1's definition of done requires the target-revision moment to
// animate (DEMO_SPEC.md §1.6.5), so this fixture completes the scene. Every
// invented line/number below is marked [ASSUMPTION].

import type { DemoEvent, Macros, Targets } from "@/lib/events";
import { athleticElevatedLipids } from "@/lib/fixtures/personas/athletic-elevated-lipids";
import type { Beat, ScenarioContext } from "./types";

const persona = athleticElevatedLipids;
const baseline = persona.baselineTargets;

export const seedEvents: DemoEvent[] = [
  { t: "SESSION_OPENED", targets: baseline, cause: "persona_baseline" },
  {
    t: "FOOD_LOGGED",
    slot: "breakfast",
    label: "Breakfast",
    // Exact numbers from frame 1's header (48g protein / 620 kcal).
    // [ASSUMPTION] carbs_g / fat_g split invented to fill out Macros.
    macros: { kcal: 620, protein_g: 48, carbs_g: 50, fat_g: 25 },
    confidence: "HIGH",
    snapshotVersion: 0,
  },
];

// --- boat-meal estimate table -------------------------------------------
// [ASSUMPTION] Every number below is invented. The photo resolves 5 items
// with high per-object confidence (frames 21-23); the two dashed/unresolved
// boxes (rib rack, citrus cocktail) are what the two clarifying chips
// settle. This table is a hand-authored lookup over the 4 combinations —
// not an estimation algorithm.

const PHOTO_BASE: Macros = { kcal: 520, protein_g: 30, carbs_g: 40, fat_g: 20 };

const RIB_RACK = {
  beef: { delta: { kcal: 210, protein_g: 12, carbs_g: 0, fat_g: 14 }, redMeat: true },
  pork: { delta: { kcal: 180, protein_g: 10, carbs_g: 0, fat_g: 11 }, redMeat: false },
} as const;

const COCKTAIL = {
  alcohol: { delta: { kcal: 160, protein_g: 0, carbs_g: 14, fat_g: 0 }, hasAlcohol: true },
  mocktail: { delta: { kcal: 90, protein_g: 0, carbs_g: 20, fat_g: 0 }, hasAlcohol: false },
} as const;

function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

function estimateBoatMeal(ribRack: keyof typeof RIB_RACK, cocktail: keyof typeof COCKTAIL) {
  const total = addMacros(addMacros(PHOTO_BASE, RIB_RACK[ribRack].delta), COCKTAIL[cocktail].delta);
  const kcalRange: [number, number] = [Math.round(total.kcal * 0.85 / 10) * 10, Math.round(total.kcal * 1.15 / 10) * 10];
  const proteinRange: [number, number] = [Math.round(total.protein_g * 0.85 / 5) * 5, Math.round(total.protein_g * 1.15 / 5) * 5];
  return {
    macros: { ...total, kcal_range: kcalRange, protein_range: proteinRange },
    redMeat: RIB_RACK[ribRack].redMeat,
    hasAlcohol: COCKTAIL[cocktail].hasAlcohol,
    kcalRange,
    proteinRange,
  };
}

// Fixed conservative bump applied whenever a MEDIUM-confidence estimate
// lands: PRODUCT_DNA.md principle 4 — lower confidence must produce more
// conservative behavior, not just a different label. [ASSUMPTION] amounts.
const REVISED_TARGETS: Targets = {
  ...baseline,
  protein_g: baseline.protein_g + 10,
  kcal: baseline.kcal - 50,
  provenance: {
    ...baseline.provenance,
    protein_g: "protein floor raised +10g ← today's boat estimate carries a range, not a point value",
    kcal: "ceiling tightened −50 ← same range, kept so the high end still lands inside today",
  },
};

function mealEstimateMessage(
  macros: Macros,
  kcalRange: [number, number],
  proteinRange: [number, number],
): string {
  return `Best estimate: about ${macros.protein_g}g protein, ${kcalRange[0]}–${kcalRange[1]} kcal. MEDIUM confidence — that is a range, not a promise, so tonight's ceiling tightens to cover it.`;
}

function redMeatCapMessage(ctx: ScenarioContext): string {
  const drawDay = ctx["schedule-choice"] === "accept" ? "Wednesday" : "Monday";
  return `That rib rack is the second red-meat occasion this week — you're at the cap, not over it. ${drawDay}'s uric acid draw will actually mean something.`;
}

export const beats: Beat[] = [
  {
    id: "user-boat-trip",
    kind: "message",
    speaker: "user",
    text: "boat trip saturday, all day thing. should I just write saturday off?",
  },
  {
    id: "push-back",
    kind: "message",
    speaker: "healthos",
    text: "No, and I want to push back on the framing rather than just answer it. A day you booked three days ago is not a day off, it is a day with different tolerances. I would rather plan it than pretend it is not happening.",
  },
  {
    id: "not-a-cheat-day-lead",
    kind: "message",
    speaker: "healthos",
    text: "I am also not going to call it a cheat day. Cheating implies you owe something back, and the version of you that owes Sunday a penalty is the version that under-eats Sunday and over-eats Monday. Here is what actually changes.",
  },
  { id: "planned-variance-card", kind: "planned-variance-card" },
  {
    // [ASSUMPTION] rewrite of the frame-12..18 "moved without asking" beat.
    // PRODUCT_DNA.md principle 12: propose, never dispose, on anything not
    // owned — a clinical draw date is calendar + clinical scheduling.
    id: "schedule-proposal",
    kind: "message",
    speaker: "healthos",
    text: "Two things I'd like to line up before Saturday — I haven't touched anything yet. Making Thursday and Friday alcohol-free would give Saturday a clean baseline, and moving your uric acid draw from Monday to Wednesday keeps a boat day from contaminating the reading. Want me to set both?",
  },
  {
    id: "schedule-choice",
    kind: "choice",
    options: [
      {
        id: "accept",
        label: "Yes, set both",
        branch: () => [
          {
            id: "schedule-accepted",
            kind: "message",
            speaker: "healthos",
            text: "Done — Thursday and Friday are alcohol-free, and Wednesday's the new draw date.",
          },
        ],
      },
      {
        id: "decline",
        label: "Not now",
        branch: () => [
          {
            id: "schedule-declined",
            kind: "message",
            speaker: "healthos",
            text: "Fair enough — I'll leave the calendar alone. Nothing about Saturday's medical rules changes either way.",
          },
        ],
      },
    ],
  },
  {
    id: "user-heading-off",
    kind: "message",
    speaker: "user",
    text: "heading off now. no idea what the food situation is",
  },
  {
    id: "you-dont-need-to-know",
    kind: "message",
    speaker: "healthos",
    text: "You do not need to know. Thursday already handled the week, so today only has to protect three things and estimate the rest.",
  },
  {
    id: "rebalanced-card",
    kind: "rebalanced-card",
    rows: [
      { label: "Before you go", value: "48g", detail: "Eat the full breakfast, it is the only meal I control" },
      { label: "On the water", value: "est", detail: "Photo the spread when it appears, I will work from that" },
      { label: "Hydration", value: "n/a", detail: "3.2L, raised for heat and likely alcohol" },
      { label: "Tonight", value: "est", detail: "Whatever is left, cutoff already suspended" },
    ],
  },
  {
    id: "photo-card",
    kind: "photo-card",
    timestamp: "13:58",
    objectsDetected: 11,
    unresolvedCount: 2,
    objects: [
      { label: "rib rack", confidence: 0.58, resolved: false, rect: { x: 0.3, y: 0.05, w: 0.32, h: 0.15 } },
      { label: "roast chicken", confidence: 0.93, resolved: true, rect: { x: 0.52, y: 0.18, w: 0.34, h: 0.19 } },
      { label: "peppers", confidence: 0.88, resolved: true, rect: { x: 0.27, y: 0.23, w: 0.19, h: 0.13 } },
      { label: "chips", confidence: 0.86, resolved: true, rect: { x: 0.05, y: 0.31, w: 0.22, h: 0.14 } },
      { label: "lettuce", confidence: 0.91, resolved: true, rect: { x: 0.29, y: 0.34, w: 0.19, h: 0.11 } },
      { label: "tomatoes", confidence: 0.95, resolved: true, rect: { x: 0.58, y: 0.36, w: 0.2, h: 0.12 } },
      { label: "citrus cocktail", confidence: 0.62, resolved: false, rect: { x: 0.27, y: 0.43, w: 0.21, h: 0.12 } },
    ],
  },
  {
    id: "good-spread",
    kind: "message",
    speaker: "healthos",
    text: "Good spread. I can see most of it. Two things I cannot call from a photo, and one of them matters a lot.",
  },
  // --- beyond frame 28: [ASSUMPTION] scene completion ---------------------
  {
    id: "ask-rib-rack",
    kind: "message",
    speaker: "healthos",
    text: "First: the rib rack — pork or beef?",
  },
  {
    id: "choice-rib-rack",
    kind: "choice",
    options: [
      {
        id: "beef",
        label: "Beef ribs",
        branch: () => [{ id: "echo-beef", kind: "message", speaker: "user", text: "Beef ribs" }],
      },
      {
        id: "pork",
        label: "Pork ribs",
        branch: () => [{ id: "echo-pork", kind: "message", speaker: "user", text: "Pork ribs" }],
      },
    ],
  },
  {
    id: "ask-cocktail",
    kind: "message",
    speaker: "healthos",
    text: "Second, and this is the one that matters — anything alcoholic in that citrus cocktail?",
  },
  {
    id: "choice-cocktail",
    kind: "choice",
    options: [
      {
        id: "alcohol",
        label: "Yes, has alcohol",
        branch: (ctx) => resolveBoatMeal(ctx, "alcohol"),
      },
      {
        id: "mocktail",
        label: "No, it's a mocktail",
        branch: (ctx) => resolveBoatMeal(ctx, "mocktail"),
      },
    ],
  },
];

function resolveBoatMeal(ctx: ScenarioContext, cocktailAnswer: keyof typeof COCKTAIL): Beat[] {
  const ribRackAnswer = (ctx["choice-rib-rack"] as keyof typeof RIB_RACK) ?? "pork";
  const { macros, redMeat, kcalRange, proteinRange } = estimateBoatMeal(ribRackAnswer, cocktailAnswer);

  const out: Beat[] = [
    {
      id: "echo-cocktail",
      kind: "message",
      speaker: "user",
      text: cocktailAnswer === "alcohol" ? "Yes, has alcohol" : "No, it's a mocktail",
    },
    {
      id: "boat-meal-estimate",
      kind: "message",
      speaker: "healthos",
      text: mealEstimateMessage(macros, kcalRange, proteinRange),
      events: [
        {
          t: "FOOD_LOGGED",
          slot: "unplanned",
          label: "Boat spread (photo estimate)",
          macros,
          confidence: "MEDIUM",
          snapshotVersion: 0,
        },
      ],
    },
  ];

  if (redMeat) {
    out.push({
      id: "red-meat-cap",
      kind: "message",
      speaker: "healthos",
      text: redMeatCapMessage(ctx),
    });
  }

  out.push({
    id: "target-revision-card",
    kind: "target-revision-card",
    causeTag: "boat spread logged (MEDIUM) → tonight's ceiling revised",
    events: [
      {
        t: "TARGETS_REVISED",
        targets: REVISED_TARGETS,
        causeEventIdx: -1, // patched by the store to the boat FOOD_LOGGED event's index
        reason:
          "Boat spread logged at MEDIUM confidence (a range, not a point value) — protein floor raised, kcal ceiling tightened, so the estimate's high end still lands inside today. Lower confidence, more conservative target.",
      },
    ],
  });

  out.push({
    id: "closing-message",
    kind: "message",
    speaker: "healthos",
    // Rendered text is filled in by the player from live reducer state
    // (lib/fixtures/copy.ts#closingMessage) — this string is a fallback only.
    text: "Tonight's numbers are on the header now.",
  });

  return out;
}

export const scenario = { persona, seedEvents, beats };
