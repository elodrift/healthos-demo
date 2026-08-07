/**
 * Deterministic responder. Turns a matched intent + the current engine state
 * into real beats — including real DemoEvents, so a meal someone types moves
 * the macro header and lands in the engine log exactly like a scripted one.
 *
 * Everything here is a pure function of (intent, snapshot). No randomness: the
 * same sentence typed twice gets the same answer, which is what makes this
 * safe to hand to a stranger.
 */

import type { DemoEvent, Macros, Targets } from "@/lib/events";
import { dishMacros, tightestVenue, venueGain, type Dish } from "@/lib/fixtures/community";
import type { MedicalRule } from "@/lib/fixtures/personas";
import type { Beat, CardSpec } from "@/lib/fixtures/script-types";
import type { Intent } from "./nlu";

export type AgentSnapshot = {
  time: string;
  name: string;
  targets: Targets;
  targetsVersion: number;
  consumed: Macros;
  remaining: Macros;
  medicalRules: MedicalRule[];
  /** true once a TARGETS_REVISED has already landed today */
  alreadyRevised: boolean;
  loggedLabels: string[];
};

let seq = 0;
function id(kind: string): string {
  seq += 1;
  return `live-${kind}-${seq}`;
}

function say(text: string, time: string, events?: DemoEvent[]): Beat {
  return { kind: "message", speaker: "healthos", text, time, id: id("say"), events };
}

function show(card: CardSpec, time: string, events?: DemoEvent[]): Beat {
  return { kind: "card", card, time, id: id("card"), events };
}

export function userBeat(text: string, time: string): Beat {
  return { kind: "message", speaker: "user", text, time, id: id("user") };
}

/* ------------------------------------------------------------------ */

const RULE_COPY: Record<string, { rule: string; body: string }> = {
  "grapefruit-amlodipine": {
    rule: "Grapefruit × Amlodipine",
    body: "Grapefruit blocks the enzyme that clears your blood-pressure medication, so the dose stacks. This one does not bend for a goal, a deficit, or a good day.",
  },
  "red-meat-uric-acid": {
    rule: "Red meat ≤ 2 / week — uric acid",
    body: "You are at two this week already. This is a ceiling from your bloodwork, not a preference I am enforcing.",
  },
};

/**
 * The reply to "I ate this too" from the community feed.
 *
 * The honest distinction this has to carry: for most dishes a big sample really
 * does narrow the estimate, and saying so is the argument for the social layer.
 * But for a dish whose variance lives in YOUR portion — hotpot, a steak cut —
 * volume changes nothing, and claiming otherwise would be the same false
 * precision this whole product refuses. So the two cases read differently.
 */
export function feedLogBeats(dish: Dish, s: AgentSnapshot): Beat[] {
  const t = s.time;

  const event: DemoEvent = {
    t: "FOOD_LOGGED",
    slot: "unplanned",
    label: dish.name,
    macros: dishMacros(dish),
    confidence: dish.confidence,
    // Scored against the version live right now, exactly like any other log.
    snapshotVersion: s.targetsVersion,
    cause: `logged from community · ${dish.logCount} logs of this dish`,
  };

  const beats: Beat[] = [
    show(
      {
        type: "estimate",
        label: dish.name,
        confidence: dish.confidence,
        kcalRange: dish.kcalRange,
        proteinRange: dish.proteinRange,
        note: dish.varianceNote,
      },
      t,
      [event],
    ),
  ];

  if (dish.reducibility === "reducible" && dish.confidence !== dish.soloConfidence) {
    beats.push(
      say(
        `Logged at the community median. ${dish.logCount} people logging this is why I can give you ${dish.confidence} confidence instead of the ${dish.soloConfidence} you would have got on your own.`,
        t,
      ),
    );
  } else if (dish.reducibility === "irreducible") {
    beats.push(
      say(
        `Logged, but I want to be straight with you: ${dish.logCount} other logs do not make this number better. The variance here is how much you personally ate, and no sample size can see your table.`,
        t,
      ),
    );
  } else {
    beats.push(
      say(
        `Logged at the community median across ${dish.logCount} logs. This dish was already tight, so the sample confirms rather than narrows.`,
        t,
      ),
    );
  }

  const tripped = dish.trips;
  if (tripped && RULE_COPY[tripped]) {
    beats.push(
      show(
        {
          type: "never-suspends",
          tag: "NEVER SUSPENDS",
          rules: [RULE_COPY[tripped].rule],
          body: RULE_COPY[tripped].body,
        },
        t,
      ),
      say(
        "Popular in the feed does not mean cleared for you. That rule came off your bloodwork and it does not care what anyone else is eating.",
        t,
      ),
    );
  }

  /*
   * The teaching moment, placed where it is actually actionable. Telling
   * someone how to log a dish better is worth most immediately after they have
   * logged it — not buried in a reference screen they would have to go find.
   *
   * Venue-specific when naming the place genuinely narrows the range, and the
   * dish's own tip otherwise. This is why `tightestVenue` returns null for
   * portion-driven dishes: it stops us coaching a habit that would not pay off.
   */
  const venue = tightestVenue(dish);
  const gain = venueGain(dish);
  beats.push(
    venue && gain
      ? say(
          `Next time, tell me where. Logs from ${venue.name} land in a range ${gain}% tighter than the unnamed pile, so naming the place does more for your numbers than describing the food.`,
          t,
        )
      : say(dish.logTip, t),
  );

  return beats;
}

/**
 * The reply to joining a friend's planned check-in from the map (DNA Block 6).
 *
 * This deliberately emits NO FOOD_LOGGED event. Nothing has been eaten — the
 * meal is tomorrow. Per DNA §4.12 the system proposes and the user disposes, so
 * a join produces a plan and a proposal, never a silent entry in the log. The
 * macro header must not move.
 *
 * The reason planned check-ins are worth building at all is visible here: a
 * meal known in advance is no longer scenario S1 (plan breaks with zero notice,
 * widest possible estimate). It can be prepared for — and if the dish trips a
 * medical rule, the rule surfaces BEFORE the meal instead of scoring it after.
 */
export function planJoinBeats(
  dish: Dish,
  placeName: string,
  when: string,
  friendName: string,
  s: AgentSnapshot,
): Beat[] {
  const t = s.time;
  const venue = tightestVenue(dish);
  const gain = venueGain(dish);

  const beats: Beat[] = [
    show(
      {
        type: "planned-variance",
        tag: "PLANNED — NOT LOGGED",
        headline: `${dish.name} · ${placeName} · ${when}`,
        body: `Nothing logged — you have not eaten yet. But knowing this now is worth more than scoring it later: I can hold room for it instead of finding out from a photo afterwards.`,
      },
      t,
    ),
  ];

  // The rule lands before the meal. This is the entire argument for planned
  // check-ins over a history-only map.
  const tripped = dish.trips;
  if (tripped && RULE_COPY[tripped]) {
    beats.push(
      show(
        {
          type: "never-suspends",
          tag: "NEVER SUSPENDS",
          rules: [RULE_COPY[tripped].rule],
          body: RULE_COPY[tripped].body,
        },
        t,
      ),
      say(
        `Better to say this now than tomorrow night. ${friendName} going does not change the rule, and you have a day to decide what you want to do about it.`,
        t,
      ),
    );
  } else if (venue && gain) {
    beats.push(
      say(
        `Useful that it is a fixed kitchen — logs from ${placeName} land ${gain}% tighter than the unnamed pile, so I can plan against a real range rather than a guess.`,
        t,
      ),
    );
  } else {
    beats.push(say(dish.logTip, t));
  }

  beats.push(
    say("Two ways I can set tomorrow up. Your call — I am not moving anything until you pick.", t),
    show(
      {
        type: "proposals",
        items: [
          `Hold room for ${dish.name.toLowerCase()} and keep the rest of the day lighter`,
          "Leave targets alone — decide at the table",
        ],
      },
      t,
    ),
  );

  return beats;
}

export function respond(intent: Intent, s: AgentSnapshot): Beat[] {
  const t = s.time;

  switch (intent.kind) {
    /* ---------------------------------------------------------------- */
    case "medical_check": {
      const tripped = intent.food?.trips;
      if (tripped && RULE_COPY[tripped]) {
        const { rule, body } = RULE_COPY[tripped];
        return [
          say("No — and this is the one kind of answer I will not soften.", t),
          show(
            {
              type: "never-suspends",
              tag: "NEVER SUSPENDS",
              rules: [rule],
              body,
            },
            t,
          ),
          say(
            "Everything else today is negotiable. This is not, so I am not going to offer you a workaround.",
            t,
          ),
        ];
      }
      return [
        say(
          `Nothing in your medical set blocks that. The two rules that never suspend are ${s.medicalRules
            .map((r) => r.label)
            .join(" and ")} — you are clear of both.`,
          t,
        ),
        say(
          `It still has to fit the day: ${Math.round(s.remaining.kcal)} kcal and ${Math.round(
            s.remaining.protein_g,
          )} g protein left.`,
          t,
        ),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "log_meal": {
      const f = intent.food!;
      const event: DemoEvent = {
        t: "FOOD_LOGGED",
        slot: "unplanned",
        label: f.label,
        macros: f.macros,
        confidence: f.confidence,
        // Scored against the version live right now — and never re-scored later.
        snapshotVersion: s.targetsVersion,
        cause: `typed: "${intent.matched ?? f.label}"`,
      };

      const card: CardSpec = {
        type: "estimate",
        label: f.label,
        confidence: f.confidence,
        kcalRange: f.macros.kcal_range ?? [f.macros.kcal, f.macros.kcal],
        proteinRange: f.macros.protein_range ?? [f.macros.protein_g, f.macros.protein_g],
        note: f.note,
      };

      const after = Math.max(0, Math.round(s.remaining.kcal - f.macros.kcal));
      const proteinAfter = Math.max(0, Math.round(s.remaining.protein_g - f.macros.protein_g));

      const tail =
        f.confidence === "HIGH"
          ? `Logged. ${after} kcal and ${proteinAfter} g protein left.`
          : `Logged as an estimate — I am not going to pretend that is a precise number. Roughly ${after} kcal and ${proteinAfter} g protein left.`;

      const beats = [show(card, t, [event]), say(tail, t)];

      if (f.trips && RULE_COPY[f.trips]) {
        beats.push(
          say("One thing, and it is not about the calories.", t),
          show(
            {
              type: "never-suspends",
              tag: "NEVER SUSPENDS",
              rules: [RULE_COPY[f.trips].rule],
              body: RULE_COPY[f.trips].body,
            },
            t,
          ),
        );
      }
      return beats;
    }

    /* ---------------------------------------------------------------- */
    case "ask_remaining": {
      const pct = Math.round((s.consumed.kcal / Math.max(1, s.targets.kcal)) * 100);
      return [
        say(
          `${Math.round(s.consumed.kcal)} of ${s.targets.kcal} kcal — ${pct}% of the day. Protein ${Math.round(
            s.consumed.protein_g,
          )} of ${s.targets.protein_g} g.`,
          t,
        ),
        say(
          s.remaining.protein_g > 60
            ? `Protein is the one to watch: ${Math.round(
                s.remaining.protein_g,
              )} g still to find, and it is the floor your lipid panel set — not a target I picked.`
            : `Protein is close enough to the floor that the rest of the day is yours.`,
          t,
        ),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "ask_what_to_eat": {
      const needProtein = s.remaining.protein_g > 40;
      return [
        say(
          `You have ${Math.round(s.remaining.kcal)} kcal and ${Math.round(
            s.remaining.protein_g,
          )} g protein left.`,
          t,
        ),
        show(
          {
            type: "proposals",
            items: needProtein
              ? [
                  "Grilled chicken + rice bowl — 48 g protein, fits the fat cap",
                  "Two eggs and Greek yoghurt — cheap protein, low fat cost",
                  "Salmon and greens — hits protein without touching the red-meat ceiling",
                ]
              : [
                  "Som tam and grilled pork skewers — light, keeps the fat cap intact",
                  "Miso soup and rice — closes the day without overshooting",
                  "Nothing, honestly. You are where you need to be.",
                ],
          },
          t,
        ),
        say("Pick one and tell me, or tell me what you actually ate and I will work backwards.", t),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "skipped_training": {
      const event: DemoEvent = {
        t: "TRAINING_CHANGED",
        change: "skipped",
        cause: `typed: "${intent.matched}"`,
      };

      if (s.alreadyRevised) {
        return [
          say("Already accounted for — I revised the day when the session dropped.", t, [event]),
          say(
            `Carbs are at ${s.targets.carbs_g} g and protein is still ${s.targets.protein_g} g. Nothing further to change.`,
            t,
          ),
        ];
      }

      const revised: Targets = {
        ...s.targets,
        kcal: s.targets.kcal - 250,
        carbs_g: s.targets.carbs_g - 80,
        provenance: { ...s.targets.provenance, carbs_g: "no session today" },
      };

      return [
        say("Then the carbohydrate you were going to spend on it is not needed.", t, [event]),
        show(
          {
            type: "target-revision",
            causeTag: "NO SESSION TODAY",
            rows: [
              { label: "Carbs", from: s.targets.carbs_g, to: revised.carbs_g, unit: "g" },
              { label: "Kcal", from: s.targets.kcal, to: revised.kcal, unit: "kcal" },
              {
                label: "Protein",
                from: s.targets.protein_g,
                to: s.targets.protein_g,
                unit: "g",
                locked: true,
              },
            ],
            lockNote: "Protein holds — that floor comes from your lipid panel, not your training.",
          },
          t,
          [
            {
              t: "TARGETS_REVISED",
              targets: revised,
              causeEventIdx: -1,
              version: s.targetsVersion + 1,
              reason: "session skipped",
              notes: ["carbs follow training load", "protein floor is medical, holds regardless"],
            },
          ],
        ),
        say("Anything you already ate today stays judged against the old numbers. I do not re-score the past.", t),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "trained_harder": {
      const event: DemoEvent = {
        t: "TRAINING_CHANGED",
        change: "harder",
        cause: `typed: "${intent.matched}"`,
      };
      const revised: Targets = {
        ...s.targets,
        kcal: s.targets.kcal + 300,
        carbs_g: s.targets.carbs_g + 90,
        provenance: { ...s.targets.provenance, carbs_g: "extra session today" },
      };
      return [
        say("Then you have earned the carbohydrate back.", t, [event]),
        show(
          {
            type: "target-revision",
            causeTag: "EXTRA SESSION",
            rows: [
              { label: "Carbs", from: s.targets.carbs_g, to: revised.carbs_g, unit: "g" },
              { label: "Kcal", from: s.targets.kcal, to: revised.kcal, unit: "kcal" },
              {
                label: "Fat cap",
                from: s.targets.fat_max_g,
                to: s.targets.fat_max_g,
                unit: "g",
                locked: true,
              },
            ],
            lockNote: "The fat ceiling does not move. Your LDL reading set it, not today's effort.",
          },
          t,
          [
            {
              t: "TARGETS_REVISED",
              targets: revised,
              causeEventIdx: -1,
              version: s.targetsVersion + 1,
              reason: "extra session",
              notes: ["carbs follow training load", "fat ceiling is medical, holds regardless"],
            },
          ],
        ),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "eating_out": {
      return [
        say("Good. I would rather plan it than correct it afterwards.", t, [
          { t: "VARIANCE_PLANNED", label: "Eating out", cause: `typed: "${intent.matched}"` },
        ]),
        show(
          {
            type: "planned-variance",
            tag: "PLANNED VARIANCE",
            headline: "This is not a failure — it is a scheduled cost",
            body: "I have moved the day's slack forward so the meal fits. Order what you want; the only line I hold is the red-meat ceiling and your medication rule.",
          },
          t,
        ),
        say("Tell me what you ordered when it lands and I will fold it in.", t),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "alcohol": {
      return [
        say(
          "Alcohol is not a medical block for you, so I am not going to moralise about it.",
          t,
        ),
        say(
          `Two things it actually costs: it sits in the fat ceiling's budget, and it blunts tomorrow's session. You have ${Math.round(
            s.remaining.kcal,
          )} kcal of room.`,
          t,
        ),
        say("Tell me roughly how many and I will log it as an estimate.", t),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "ask_why": {
      const prov = Object.entries(s.targets.provenance);
      return [
        say("Every number I hold has a cause. Here is where today's came from.", t),
        show(
          {
            type: "proposals",
            items: prov.map(([k, v]) => `${labelFor(k)} — ${v}`),
          },
          t,
        ),
        say(
          s.alreadyRevised
            ? "The revision on top of that came from your training changing, and it is logged in the engine panel with the event that caused it."
            : "Nothing has been revised yet today, so these are still the opening numbers.",
          t,
        ),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "share": {
      const lastLog = s.loggedLabels[s.loggedLabels.length - 1];
      return [
        say(
          lastLog
            ? `I can post ${lastLog.toLowerCase()} to Community. It stays logged either way — posting only changes who else can see it.`
            : "I can post to Community once you have logged something. It stays logged either way — posting only changes who else can see it.",
          t,
        ),
        // The only honest case for sharing, and the one worth making: the
        // community numbers that tightened YOUR estimates were somebody else's
        // logs. Posting pays that back. No streaks, no kudos, no vanity metric.
        say(
          "Worth knowing what it actually does: your numbers join the sample for that dish, so the next person guessing at it gets a narrower range than you got. The reverse already happened to you today.",
          t,
        ),
        show(
          {
            type: "proposals",
            items: [
              "Post it — add my numbers to the sample",
              "Keep it private — logged, not posted",
            ],
          },
          t,
        ),
        say("Community, at the bottom of the screen, is where it lands.", t),
      ];
    }

    /* ----------------------------------------------------------------
     * The long tail. None of these move a number, so none of them emit an
     * event — but all of them decide whether the person keeps trusting the
     * thing. The rule for every one: engage with what they actually said,
     * never answer with a macro reminder they can already see.
     * ---------------------------------------------------------------- */
    case "low_motivation": {
      return [
        say("That is worth taking seriously rather than talking you out of.", t),
        say(
          "I am not going to tell you to push through, and I am not going to pretend a protein target matters much today.",
          t,
        ),
        say(
          "The only thing I would ask: keep telling me what you eat, even roughly, even badly. A wide estimate I know about is worth more than a clean day I made up — and it means you are not starting from zero when this lifts.",
          t,
        ),
      ];
    }

    case "temptation": {
      const kcalLeft = Math.round(s.remaining.kcal);
      const fatLeft = Math.round(s.remaining.fat_g);
      // Never assert there is room without checking. A cheerful "you have
      // plenty left" on a day already spent is the exact false confidence this
      // product exists to refuse.
      const roomy = kcalLeft > 300;

      return [
        say("Willpower is not the variable I would try to fix.", t),
        roomy
          ? say(
              `You have ${kcalLeft} kcal and ${fatLeft} g of fat headroom left, so the thing you are thinking about probably fits. Have it deliberately rather than at 11pm standing up.`,
              t,
            )
          : say(
              `Honestly, no — ${kcalLeft} kcal and ${fatLeft} g of fat left means it does not fit today without pushing you over. I am not going to pretend otherwise.`,
              t,
            ),
        say(
          roomy
            ? "Eat it and tell me. An honest line in the log costs you nothing; a hidden one costs me the ability to explain your numbers next week."
            : "If you eat it anyway, still tell me. I would much rather score the day you actually had than the day you wish you had.",
          t,
        ),
      ];
    }

    case "schedule_change": {
      return [
        say("That changes the shape of the day, not the targets.", t),
        say(
          `Protein stays at ${s.targets.protein_g} g and the fat ceiling stays at ${s.targets.fat_max_g} g — both came from your bloodwork, and a clock does not move either one.`,
          t,
        ),
        say(
          "Meal timing is yours to arrange. Tell me when your training actually lands under the new schedule and I will move the carbohydrate to sit around it.",
          t,
        ),
      ];
    }

    case "diet_trend": {
      return [
        say("I will give you the honest version rather than the encouraging one.", t),
        show(
          {
            type: "never-suspends",
            tag: "WHAT DOES NOT BEND",
            rules: s.medicalRules.map((r) => r.label),
            body: "Any regime you pick has to clear these first. They came from your bloodwork and your prescription, so they hold inside any diet you want to try.",
          },
          t,
        ),
        say(
          `Past that, most of it comes down to whether you can hold ${s.targets.protein_g} g of protein and stay under ${s.targets.fat_max_g} g of fat while doing it. If a plan makes that harder, it is working against the two numbers that are actually medical.`,
          t,
        ),
        say("If you want to try it, tell me and I will score the day against it honestly rather than argue.", t),
      ];
    }

    case "illness": {
      return [
        say("Then today is not a day I am going to hold you to a target.", t),
        say(
          `Protein is a floor for recovery, not a score to chase — ${s.targets.protein_g} g is what I would still aim at if you can eat at all. If you cannot, that is information, not a failure.`,
          t,
        ),
        say(
          "Tell me what you manage and I will log it. When you are back, I will revise the week rather than pretending these days did not happen.",
          t,
        ),
      ];
    }

    case "weight_stalled": {
      return [
        say("Before I change anything, I want to be honest about what I can and cannot see.", t),
        say(
          `Every low-confidence estimate in your log is a place the real number could be higher than what I recorded. ${
            s.loggedLabels.length
              ? `Today alone: ${s.loggedLabels.slice(0, 3).join(", ")}.`
              : "You have not logged much today, which widens it further."
          }`,
          t,
        ),
        say(
          "So the first answer is not 'eat less'. It is that a plateau against uncertain intake is not evidence of a broken metabolism — it is usually evidence that the intake is higher than the log says.",
          t,
        ),
        say(
          "Log a few days tightly, then I will have something worth revising the targets against. I would rather change them on evidence than on a guess.",
          t,
        ),
      ];
    }

    /* ---------------------------------------------------------------- */
    case "greeting":
      return [
        say(`${s.name}. ${Math.round(s.remaining.kcal)} kcal and ${Math.round(s.remaining.protein_g)} g protein left today.`, t),
        say("Tell me what you ate, what changed, or ask me why any number is what it is.", t),
      ];

    case "thanks":
      return [say("Noted. Keep telling me when things change — that is the whole mechanism.", t)];

    default:
      return [];
  }
}

function labelFor(key: string): string {
  switch (key) {
    case "protein_g":
      return "Protein floor";
    case "kcal":
      return "Calories";
    case "carbs_g":
      return "Carbohydrate";
    case "fat_max_g":
      return "Fat ceiling";
    default:
      return key;
  }
}
