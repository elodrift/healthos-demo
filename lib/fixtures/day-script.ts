// The day's script. Copy is fixed — the voice IS the product.
// Every beat carries the DemoEvents it appends to the append-only event array.

import type { DemoEvent, Macros, Targets } from "@/lib/events";
import { personaById, type GoalMode } from "./personas";
import type { Beat, ScriptContext, Setup } from "./script-types";

/* ------------------------------------------------------------------ macros */

const BREAKFAST: Macros = { kcal: 620, protein_g: 48, carbs_g: 62, fat_g: 18 };
const LUNCH: Macros = { kcal: 620, protein_g: 52, carbs_g: 58, fat_g: 22 };
const DINNER_BIG: Macros = { kcal: 1250, protein_g: 85, carbs_g: 92, fat_g: 44 };
const DINNER_SMALL: Macros = { kcal: 520, protein_g: 42, carbs_g: 30, fat_g: 18 };

/* ----------------------------------------------------------------- targets */

export function baselineTargets(setup: Setup): Targets {
  return personaById(setup.personaId).baselineTargets;
}

/** The SAME disruption, revised differently per goal mode. */
export function revisedTargets(setup: Setup): Targets {
  const base = baselineTargets(setup);
  const carbs = setup.mode === "fast" ? 205 : 240;
  const kcal = setup.mode === "fast" ? 2210 : 2350;
  return {
    ...base,
    kcal,
    carbs_g: carbs,
    protein_g: base.protein_g, // never moves
    provenance: {
      ...base.provenance,
      carbs_g: "no session today",
      kcal: setup.mode === "fast" ? "aggressive deficit, no session" : "no session today",
      protein_g: "floor set by your lipid panel — immutable",
    },
  };
}

/* -------------------------------------------------------------- seed events */

export type SeedEvent = { event: DemoEvent; at: string };

export function seedEvents(setup: Setup): SeedEvent[] {
  return [
    {
      at: "06:30",
      event: {
        t: "SESSION_OPENED",
        targets: baselineTargets(setup),
        cause: "persona baseline + training day",
      },
    },
    {
      at: "06:35",
      event: {
        t: "FOOD_LOGGED",
        slot: "breakfast",
        label: "Breakfast — oats, skyr, berries",
        macros: BREAKFAST,
        confidence: "HIGH",
        snapshotVersion: 0,
        cause: "planned meal · scored against targets v1",
      },
    },
  ];
}

/* --------------------------------------------------------------- the script */

const user = (id: string, time: string, text: string): Beat => ({
  id,
  kind: "message",
  speaker: "user",
  time,
  text,
});

const bot = (id: string, time: string, text: string, events?: DemoEvent[]): Beat => ({
  id,
  kind: "message",
  speaker: "healthos",
  time,
  text,
  ...(events ? { events } : {}),
});

/* ---- Beat 4a — THE DISRUPTION: skipped training (the climax) ------------- */

function skippedTrainingBranch(ctx: ScriptContext): Beat[] {
  const setup = ctx.setup;
  const base = baselineTargets(setup);
  const revised = revisedTargets(setup);
  const mode: GoalMode = setup.mode;

  const beats: Beat[] = [
    user("b4a-user", "15:00", "have to skip training today, work exploded"),
    bot(
      "b4a-say",
      "15:00",
      "Okay. Skipping changes what today is for. I am revising your targets — carbs come down, protein floor stays exactly where your lipid panel put it.",
      [{ t: "TRAINING_CHANGED", change: "skipped", cause: "user-declared: session dropped" }],
    ),
    {
      id: "b4a-revision",
      kind: "card",
      time: "15:00",
      card: {
        type: "target-revision",
        causeTag: "training skipped → targets revised",
        rows: [
          { label: "Carbs", from: base.carbs_g, to: revised.carbs_g, unit: "g" },
          { label: "Kcal", from: base.kcal, to: revised.kcal, unit: "" },
          {
            label: "Protein",
            from: base.protein_g,
            to: revised.protein_g,
            unit: "g",
            locked: true,
          },
        ],
        lockNote: "floor set by your lipid panel — it does not move",
      },
      events: [
        {
          t: "TARGETS_REVISED",
          targets: revised,
          causeEventIdx: -1,
          version: 2,
          reason: "TRAINING_CHANGED",
          notes: [
            "protein floor immutable (lipid panel)",
            "no retroactive re-scoring",
          ],
        },
      ],
    },
    {
      id: "b4a-morning",
      kind: "card",
      time: "15:00",
      card: {
        type: "morning-untouched",
        caption:
          "Your morning is judged against the plan that existed when you ate it. Nothing gets re-scored.",
        meals: ["Breakfast — 48g protein · 620 kcal", "Lunch — 52g protein · 620 kcal"],
      },
    },
  ];

  if (mode === "fast") {
    beats.push(
      bot(
        "b4a-aggressive",
        "15:05",
        "Aggressive mode trades comfort for speed — tonight will feel lean. Protein floor still never moves.",
      ),
    );
  }

  beats.push(
    bot(
      "b4a-dinner",
      "15:05",
      mode === "fast"
        ? "Dinner goes protein-forward and light on starch: chicken, greens, a small potato. It lands you on the protein floor without the carbs you no longer earned."
        : "Dinner goes protein-forward: chicken, greens, a modest starch. It lands you on the protein floor with room to spare.",
    ),
    {
      id: "b4a-dinner-choice",
      kind: "choice",
      time: "18:40",
      options: [
        {
          id: "ran-bigger",
          label: "Logged dinner — it ran bigger than that",
          branch: () => [
            user("b4a-dinner-user", "18:40", "logged dinner — it ran bigger than that"),
            {
              id: "b4a-dinner-log",
              kind: "message",
              speaker: "healthos",
              time: "18:40",
              text: "Logged. Protein floor is met exactly, and the kcal sit above the revised number. That is a plan change, not a failure.",
              events: [
                {
                  t: "FOOD_LOGGED",
                  slot: "dinner",
                  label: "Dinner — chicken, greens, starch",
                  macros: DINNER_BIG,
                  confidence: "HIGH",
                  snapshotVersion: 1,
                  cause: "confirmed meal · scored against targets v2",
                },
              ],
            },
            ...eveningRevised(ctx),
            ...dayCloseRevised(ctx),
          ],
        },
      ],
    },
  );

  return beats;
}

/* ---- Beat 4b — THE DISRUPTION: restaurant, unknown plate ----------------- */

function restaurantBranch(ctx: ScriptContext): Beat[] {
  const plate = (
    id: string,
    label: string,
    macros: Macros,
    kcalRange: [number, number],
    proteinRange: [number, number],
  ) => ({
    id,
    label,
    branch: (): Beat[] => [
      user(`b4b-${id}-user`, "15:05", label),
      {
        id: `b4b-${id}-estimate`,
        kind: "card" as const,
        time: "15:05",
        card: {
          type: "estimate" as const,
          label,
          confidence: "MEDIUM" as const,
          kcalRange,
          proteinRange,
          note: "Logged as a range, not a number. The engine plans against the conservative end.",
        },
        events: [
          {
            t: "FOOD_LOGGED" as const,
            slot: "unplanned" as const,
            label: "Restaurant plate — described, not weighed",
            macros: {
              ...macros,
              kcal_range: kcalRange,
              protein_range: proteinRange,
            },
            confidence: "MEDIUM" as const,
            snapshotVersion: 0,
            cause: "range applied · engine adjusts conservatively",
          },
        ],
      },
      bot(
        `b4b-${id}-after`,
        "15:10",
        "Three things stay protected: your protein floor, your fat ceiling, and both medical rules. Everything else absorbs the uncertainty.",
      ),
      ...eveningUncertain(ctx),
      ...dayCloseUncertain(ctx),
    ],
  });

  return [
    user("b4b-user", "15:00", "ended up at a restaurant, no idea what's in this"),
    bot(
      "b4b-say",
      "15:00",
      "You don't need to know precisely. Today only has to protect three things and estimate the rest. Describe the plate in one line.",
    ),
    {
      id: "b4b-plate",
      kind: "choice",
      time: "15:05",
      options: [
        plate(
          "chicken-pasta",
          "grilled chicken, creamy pasta, side salad, two glasses of wine",
          { kcal: 780, protein_g: 46, carbs_g: 72, fat_g: 34 },
          [650, 950],
          [38, 55],
        ),
        plate(
          "burrito-bowl",
          "big burrito bowl, chips on the side, one beer",
          { kcal: 900, protein_g: 40, carbs_g: 104, fat_g: 32 },
          [760, 1080],
          [32, 48],
        ),
      ],
    },
  ];
}

/* ---- Beat 5 — evening check-in ------------------------------------------- */

function eveningRevised(ctx: ScriptContext): Beat[] {
  const revised = revisedTargets(ctx.setup);
  return [
    {
      id: "b5a-say",
      kind: "message",
      speaker: "healthos",
      time: "19:00",
      text: "Over the revised target — because the plan changed, not because you overate. Here is the protect-what-matters version of the evening.",
      events: [
        {
          t: "DIAGNOSIS",
          code: "over_by_revision",
          causeChain: [
            "TRAINING_CHANGED: skipped",
            `TARGETS_REVISED v2: kcal → ${revised.kcal}`,
            "dinner logged against v2",
            "over_by_revision",
          ],
        },
      ],
    },
    {
      id: "b5a-status",
      kind: "card",
      time: "19:00",
      card: {
        type: "evening-status",
        tone: "estimate",
        label: "OVER BY REVISION",
        body: "Protein floor: held. Fat ceiling: held. Both medical rules: held. Nothing from this morning was re-scored, and nothing carries into tomorrow.",
      },
    },
  ];
}

function eveningUncertain(_ctx: ScriptContext): Beat[] {
  return [
    {
      id: "b5b-say",
      kind: "message",
      speaker: "healthos",
      time: "19:00",
      text: "One estimate in a day is fine. Two starts guessing, so tonight stays known: a small, confirmed dinner that lifts you onto the protein floor.",
    },
    {
      id: "b5b-choice",
      kind: "choice",
      time: "19:30",
      options: [
        {
          id: "logged",
          label: "Done",
          branch: () => [
            user("b5b-user", "19:30", "done"),
            {
              id: "b5b-log",
              kind: "message",
              speaker: "healthos",
              time: "19:30",
              text: "Logged exactly. The day's only uncertainty is still the one plate, and it stays labelled as an estimate.",
              events: [
                {
                  t: "FOOD_LOGGED",
                  slot: "dinner",
                  label: "Dinner — cottage cheese bowl, greens",
                  macros: DINNER_SMALL,
                  confidence: "HIGH",
                  snapshotVersion: 0,
                  cause: "confirmed meal · scored against targets v1",
                },
                {
                  t: "DIAGNOSIS",
                  code: "uncertain",
                  causeChain: [
                    "FOOD_LOGGED: confidence MEDIUM",
                    "range applied, conservative end used",
                    "uncertain",
                  ],
                },
              ],
            },
            {
              id: "b5b-status",
              kind: "card",
              time: "19:30",
              card: {
                type: "evening-status",
                tone: "green",
                label: "UNCERTAIN — BY DESIGN",
                body: "Protein floor: held. Fat ceiling: held. Both medical rules: held. One meal stays an estimate — it is not presented as a score.",
              },
            },
          ],
        },
      ],
    },
  ];
}

/* ---- Beat 6 — day close -------------------------------------------------- */

function closeBeats(
  known: string[],
  uncertain: string[],
  whatMattered: string[],
): Beat[] {
  return [
    {
      id: "b6-summary",
      kind: "card",
      time: "21:00",
      card: {
        type: "day-close",
        summary: { known, uncertain, whatMattered },
      },
      events: [
        {
          t: "DAY_CLOSED",
          summary: { known, uncertain, whatMattered },
          cause: "day closed · nothing re-scored retroactively",
        },
      ],
    },
    bot("b6-say", "21:00", "Tomorrow's first priority is set. Sleep well."),
    { id: "b6-close", kind: "close", time: "21:00" },
  ];
}

function dayCloseRevised(ctx: ScriptContext): Beat[] {
  const revised = revisedTargets(ctx.setup);
  return closeBeats(
    [
      "Breakfast — 48g protein · 620 kcal",
      "Lunch, salmon bowl — 52g protein · 620 kcal",
      "Dinner — 85g protein · 1,250 kcal",
    ],
    ["Nothing estimated today — every meal was confirmed."],
    [
      "protein floor held",
      "carbs matched actual training",
      "your Saturday plan is set",
      `targets revised to ${revised.kcal} kcal at 15:00, not retroactively`,
    ],
  );
}

function dayCloseUncertain(_ctx: ScriptContext): Beat[] {
  return closeBeats(
    [
      "Breakfast — 48g protein · 620 kcal",
      "Lunch, salmon bowl — 52g protein · 620 kcal",
      "Dinner — 42g protein · 520 kcal",
    ],
    ["Restaurant plate — CONFIDENCE MEDIUM, planned at the conservative end of the range"],
    [
      "protein floor held",
      "carbs matched actual training",
      "your Saturday plan is set",
      "the estimate stayed labelled an estimate",
    ],
  );
}

/* ---- Beats 1–3 and the disruption fork ---------------------------------- */

export function buildScript(): Beat[] {
  return [
    bot(
      "b1-brief",
      "06:30",
      "Morning. Sleep was decent, HRV is back at your baseline, so today stays a full training day. Targets: 185g protein, 2,700 kcal, carbs weighted around your 17:00 session. Breakfast and lunch are planned; nothing for you to decide before noon.",
    ),
    {
      id: "b2-open",
      kind: "choice",
      time: "08:55",
      options: [
        {
          id: "boat",
          label: "btw — boat trip saturday with friends, all day thing. should I just write saturday off?",
          branch: () => [
            user(
              "b2-user",
              "08:55",
              "btw — boat trip saturday with friends, all day thing. should I just write saturday off?",
            ),
            bot(
              "b2-pushback",
              "08:55",
              "No — and I want to push back on the framing. A day you booked three days ago is not a day off, it is a day with different tolerances. I am not going to call it a cheat day either. Here is how Saturday actually works:",
            ),
            {
              id: "b2-variance",
              kind: "card",
              time: "08:56",
              card: {
                type: "planned-variance",
                tag: "SATURDAY · PLANNED VARIANCE",
                headline: "not a cheat day",
                body: "a day with different tolerances.",
              },
              events: [
                {
                  t: "VARIANCE_PLANNED",
                  label: "Saturday — all-day boat trip",
                  cause: "user-declared event Saturday",
                },
              ],
            },
            {
              id: "b2-medical",
              kind: "card",
              time: "08:56",
              card: {
                type: "never-suspends",
                tag: "NEVER SUSPENDS · MEDICAL",
                rules: ["Grapefruit × Amlodipine", "Red meat ≤ 2 / week — uric acid"],
                body: "These are not preferences and Saturday does not change them. If anything I watch harder, because unplanned food is where interactions hide.",
              },
            },
            bot("b2-proposals-say", "08:57", "Two proposals to set Saturday up clean — your call:"),
            {
              id: "b2-proposals-card",
              kind: "card",
              time: "08:57",
              card: {
                type: "proposals",
                items: [
                  "Thursday and Friday alcohol-free, so Saturday starts from a clean baseline.",
                  "Move your uric acid draw from Monday to Wednesday, so a boat day does not contaminate the reading.",
                ],
              },
            },
            {
              id: "b2-decide",
              kind: "choice",
              time: "08:58",
              options: [
                {
                  id: "both",
                  label: "Accept both",
                  branch: () => [
                    user("b2-both-user", "08:58", "accept both"),
                    bot(
                      "b2-both-ack",
                      "08:58",
                      "Done. Thursday and Friday are alcohol-free, and the draw moves to Wednesday. Saturday is a planned day now, not a surprise.",
                      [
                        {
                          t: "PROPOSAL_ACCEPTED",
                          label: "Thu/Fri alcohol-free",
                          cause: "clean Saturday baseline",
                        },
                        {
                          t: "PROPOSAL_ACCEPTED",
                          label: "draw moved Mon→Wed",
                          cause: "reading integrity",
                        },
                      ],
                    ),
                    ...lunchBeats(),
                  ],
                },
                {
                  id: "alcohol",
                  label: "Just the alcohol-free days",
                  branch: () => [
                    user("b2-alc-user", "08:58", "just the alcohol-free days"),
                    bot(
                      "b2-alc-ack",
                      "08:58",
                      "Fine. Thursday and Friday go alcohol-free. The draw stays on Monday and I will flag the reading as boat-adjacent, so you read it with that in mind.",
                      [
                        {
                          t: "PROPOSAL_ACCEPTED",
                          label: "Thu/Fri alcohol-free",
                          cause: "clean Saturday baseline",
                        },
                      ],
                    ),
                    ...lunchBeats(),
                  ],
                },
                {
                  id: "none",
                  label: "Leave everything",
                  branch: () => [
                    user("b2-none-user", "08:58", "leave everything"),
                    bot(
                      "b2-none-ack",
                      "08:58",
                      "Noted, nothing moves. Saturday still runs as a planned variance, and the medical rules still hold — that part was never on the table.",
                    ),
                    ...lunchBeats(),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function lunchBeats(): Beat[] {
  return [
    {
      id: "b3-push",
      kind: "card",
      time: "12:30",
      card: {
        type: "meal-push",
        title: "Lunch: salmon bowl, ~52g protein.",
        why: "Why now: it keeps the carb window clear for 17:00 training.",
      },
    },
    {
      id: "b3-choice",
      kind: "choice",
      time: "12:30",
      options: [
        {
          id: "done",
          label: "Done",
          branch: () => [
            {
              id: "b3-user",
              kind: "message",
              speaker: "user",
              time: "12:30",
              text: "Done",
              events: [
                {
                  t: "FOOD_LOGGED",
                  slot: "lunch",
                  label: "Lunch — salmon bowl",
                  macros: LUNCH,
                  confidence: "HIGH",
                  snapshotVersion: 0,
                  cause: "planned meal · scored against targets v1",
                },
              ],
            },
            ...disruptionFork(),
          ],
        },
      ],
    },
  ];
}

function disruptionFork(): Beat[] {
  return [
    {
      id: "b4-fork",
      kind: "choice",
      time: "15:00",
      options: [
        {
          id: "skip-training",
          label: "have to skip training today, work exploded",
          branch: (ctx) => skippedTrainingBranch(ctx),
        },
        {
          id: "restaurant",
          label: "ended up at a restaurant, no idea what's in this",
          branch: (ctx) => restaurantBranch(ctx),
        },
      ],
    },
  ];
}

/** Beat ids that a scrubber tap should be able to jump to. */
export const dayClock = ["06:30", "08:55", "12:30", "15:00", "19:00", "21:00", "22:00"];
