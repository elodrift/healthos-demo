/**
 * Fake data for the Today screen. No backend, no API, no auth — this module is
 * the single source of truth for the screen and is deliberately pure.
 *
 * The important part is the `Amount` type, not the numbers.
 *
 * §4.11 of this product says an assumption must never appear in the same voice
 * as a measurement. Everywhere else in the app that rule is enforced by review
 * and by captions written carefully by hand, which is how `logged-against-target`
 * once shipped a caption calling a weighed label reading an estimate. Here the
 * rule is enforced by the type: an estimated amount has no `g` field to print,
 * so "show a fake-precise number for an estimate" is not a mistake you can make
 * without the compiler stopping you. That is the brand expressed as a data shape.
 */

/** How a number came to be known. Drives the chip and the formatting. */
export type Knowledge = "weighed" | "label" | "estimated";

/**
 * A macro amount.
 *
 * Exact carries a single figure and how it was established. Estimated carries a
 * low and a high and *cannot* carry a point value — that absence is the whole
 * design. Reach for `formatAmount` rather than touching the fields directly.
 */
export type Amount =
  | { known: "exact"; via: "weighed" | "label"; g: number }
  | { known: "estimated"; lowG: number; highG: number };

export const exact = (g: number, via: "weighed" | "label" = "label"): Amount => ({
  known: "exact",
  via,
  g,
});

export const estimated = (lowG: number, highG: number): Amount => ({
  known: "estimated",
  lowG,
  highG,
});

/** en-dash for ranges, and a leading tilde so a glance reads "about". */
export function formatAmount(a: Amount, unit = "g"): string {
  return a.known === "exact" ? `${a.g}${unit}` : `~${a.lowG}\u2013${a.highG}${unit}`;
}

export function knowledgeOf(a: Amount): Knowledge {
  return a.known === "exact" ? a.via : "estimated";
}

/** The chip label. "Weighed" and "Exact" are different promises, so different words. */
export const KNOWLEDGE_LABEL: Record<Knowledge, string> = {
  weighed: "Weighed",
  label: "Exact",
  estimated: "Estimated",
};

/**
 * Summing amounts is where honesty usually dies: add one exact figure to one
 * estimate and the natural instinct is to print the midpoint, or worse the
 * optimistic end, as fact. The result here stays a range whenever any input was
 * a range, so the total can never be firmer than its softest row.
 */
export function sumAmounts(parts: Amount[]): Amount {
  let low = 0;
  let high = 0;
  let anyEstimated = false;
  let allWeighed = true;

  for (const p of parts) {
    if (p.known === "exact") {
      low += p.g;
      high += p.g;
      if (p.via !== "weighed") allWeighed = false;
    } else {
      low += p.lowG;
      high += p.highG;
      anyEstimated = true;
      allWeighed = false;
    }
  }

  if (anyEstimated) return { known: "estimated", lowG: low, highG: high };
  return { known: "exact", via: allWeighed ? "weighed" : "label", g: low };
}

/** Grams still to go. A range in, a range out — same rule as `sumAmounts`. */
export function remainingTo(target: number, logged: Amount): Amount {
  if (logged.known === "exact") {
    return { known: "exact", via: logged.via, g: Math.max(0, target - logged.g) };
  }
  return {
    known: "estimated",
    lowG: Math.max(0, target - logged.highG),
    highG: Math.max(0, target - logged.lowG),
  };
}

export interface LoggedMeal {
  id: string;
  slot: string;
  at: string;
  what: string;
  where: string;
  protein: Amount;
  carbs: Amount;
}

/** cook / order / grab / restaurant — where the food physically comes from. */
export type Channel = "cook" | "order" | "grab" | "restaurant";

export const CHANNEL_LABEL: Record<Channel, string> = {
  cook: "Cook",
  order: "Order",
  grab: "Grab",
  restaurant: "Restaurant",
};

export interface FoodOption {
  id: string;
  channel: Channel;
  /** e.g. "2 min" or "arrives ~20 min" — the cost of choosing this one. */
  effort: string;
  what: string;
  detail: string;
  protein: Amount;
  carbs: Amount;
  /** One line. Why this option, in the user's terms. */
  why: string;
}

export interface Occasion {
  id: string;
  kind: "now" | "later";
  label: string;
  /** "Open until 16:30" / "19:00" */
  timing: string;
  headline: string;
  options: FoodOption[];
}

/* ---------------------------------------------------------------------------
 * The day. 15:40, training day. Trained 07:00, breakfast and lunch logged.
 * No grapefruit, organ meats, shellfish or beer anywhere — the medication
 * interaction rules apply to sample data too.
 * ------------------------------------------------------------------------- */

export const NOW = "15:40";
export const DAY_LABEL = "Thursday";

export const PROTEIN_TARGET_G = 175;
export const CARB_TARGET_G = 405;

export const LOGGED: LoggedMeal[] = [
  {
    id: "breakfast",
    slot: "Breakfast",
    at: "07:45",
    what: "Greek yogurt, oats, blueberries",
    where: "Home, weighed",
    protein: exact(34, "weighed"),
    carbs: exact(52, "weighed"),
  },
  {
    id: "lunch",
    slot: "Lunch",
    at: "12:30",
    what: "Chicken rice bowl",
    where: "Restaurant",
    protein: estimated(38, 48),
    carbs: estimated(130, 158),
  },
];

/**
 * Derived, never hardcoded. An earlier draft wrote the day totals out by hand
 * beside the rows they were supposed to summarise, which is how a total quietly
 * stops matching its own evidence.
 */
export const PROTEIN_LOGGED = sumAmounts(LOGGED.map((m) => m.protein));
export const CARBS_LOGGED = sumAmounts(LOGGED.map((m) => m.carbs));
export const PROTEIN_REMAINING = remainingTo(PROTEIN_TARGET_G, PROTEIN_LOGGED);

export const SNACK: Occasion = {
  id: "snack",
  kind: "now",
  label: "Snack window",
  timing: "Open until 16:30",
  headline: "A protein-forward snack now keeps dinner comfortable.",
  options: [
    {
      id: "cottage-cheese",
      channel: "cook",
      effort: "2 min",
      what: "Cottage cheese + almonds",
      detail: "200g cottage cheese, 20g almonds",
      protein: exact(28, "label"),
      carbs: exact(9, "label"),
      why: "Fastest way to close the gap.",
    },
    {
      id: "chicken-wrap",
      channel: "order",
      effort: "arrives ~20 min",
      what: "Grilled chicken wrap",
      detail: "Cafe two streets over",
      protein: estimated(30, 36),
      carbs: estimated(38, 46),
      why: "Hands-off, and still inside the window.",
    },
    {
      id: "shake-banana",
      channel: "grab",
      effort: "30 sec",
      what: "Protein shake + banana",
      detail: "One scoop, medium banana",
      protein: exact(27, "label"),
      carbs: exact(31, "label"),
      why: "If you're heading out.",
    },
  ],
};

export const DINNER: Occasion = {
  id: "dinner",
  kind: "later",
  label: "Dinner",
  timing: "19:00",
  headline: "Shifted protein-heavier to finish the day level.",
  options: [
    {
      id: "salmon",
      channel: "cook",
      effort: "25 min",
      what: "Grilled salmon, rice, greens",
      detail: "180g salmon, 90g dry rice",
      protein: exact(42, "weighed"),
      carbs: exact(71, "weighed"),
      why: "Hits the evening protein without a large plate.",
    },
    {
      id: "beef-stirfry",
      channel: "order",
      effort: "arrives ~35 min",
      what: "Lean beef stir-fry",
      detail: "With steamed rice",
      protein: estimated(38, 46),
      carbs: estimated(78, 96),
      why: "Similar protein, no cooking.",
    },
    {
      id: "tofu-curry",
      channel: "restaurant",
      effort: "10 min walk",
      what: "Tofu curry",
      detail: "Thai place on the corner",
      protein: estimated(28, 36),
      carbs: estimated(84, 104),
      why: "Lightest protein of the three — pair it with the snack above.",
    },
  ],
};

/** First-class, one plain sentence. Not a footnote. */
export const WHY_CHANGED =
  "Lunch came in lighter on protein than planned, so your snack window opened and dinner shifted protein-heavier.";

export const DAY_STATUS = "Training done at 07:00. Nothing more to train today — the rest is food.";
