/**
 * The community layer.
 *
 * This is not a vanity feed bolted onto a health app. It exists because of one
 * mechanic that follows directly from the engine's posture on uncertainty:
 *
 *   A single person logging "pad thai" has a genuinely wide range. Forty people
 *   logging the same dish at the same kinds of stalls narrows it. Community
 *   volume is a real instrument for reducing estimate error.
 *
 * But — and this is the part that keeps it honest — volume only helps when the
 * uncertainty is in the *dish*. For an all-you-can-eat hotpot the variance is in
 * how many plates YOU took, and no amount of other people's logs will ever tell
 * us that. So each dish carries whether its uncertainty is reducible, and the
 * dish page says so plainly instead of implying more data always helps.
 *
 * ---------------------------------------------------------------------------
 * [ASSUMPTION] EVERY NUMBER AND NAME IN THIS FILE IS INVENTED FOR THE DEMO.
 *
 * Per DEMO_SPEC §4, no fixture value may be authored by the agent without being
 * marked. That applies to all of it: log counts, kcal/protein medians and
 * ranges, confidence tiers, streak counts, place names, coordinates, check-in
 * times, and every caption. None of it is sourced from real nutrition data,
 * and no place named here is a real business — the names are deliberately
 * descriptive ("Wok stall — north lane") rather than real restaurants, so the
 * demo never makes a factual-looking claim about somewhere that exists.
 *
 * The numbers are authored to be internally consistent (venue log counts sum to
 * each dish total, ranges bracket their medians) because the demo argues about
 * uncertainty and would undercut itself with arithmetic that does not hold.
 * Consistent is not the same as real. Do not cite any of it.
 * ---------------------------------------------------------------------------
 */

import type { Confidence, Macros } from "@/lib/events";

export type Reducibility = "reducible" | "irreducible";

/**
 * A physical place, shared by the check-in map (DNA Block 6) and the per-venue
 * ranges on a dish. Both features need to agree on what a place is called, so
 * the name lives here once and both read from it.
 *
 * [ASSUMPTION] All names are invented and deliberately descriptive rather than
 * real businesses. Coordinates are plausible points in Bangkok chosen to spread
 * legibly on a small map — they are not real addresses.
 */
export type Place = {
  id: string;
  name: string;
  /** neutral area label for context — not a real district claim */
  area: string;
  /** [ASSUMPTION] [lat, lng] */
  coords: [number, number];
};

export const places: Place[] = [
  { id: "wok-north", name: "Wok stall — north lane", area: "north market", coords: [13.781, 100.556] },
  { id: "noodle-oldtown", name: "Noodle house — old town", area: "old town", coords: [13.752, 100.499] },
  { id: "hotpot-chain", name: "Hotpot chain — all-you-can-eat", area: "mall district", coords: [13.744, 100.534] },
  { id: "salad-chain", name: "Salad chain — printed macros", area: "office district", coords: [13.73, 100.568] },
  { id: "isaan-row", name: "Isaan stall — market row", area: "market row", coords: [13.779, 100.541] },
  { id: "hawker-centre", name: "Hawker stall — centre market", area: "centre market", coords: [13.725, 100.53] },
  { id: "kopitiam", name: "Neighbourhood kopitiam", area: "riverside", coords: [13.737, 100.561] },
  { id: "canal-stalls", name: "Canal-side noodle stalls", area: "canal side", coords: [13.769, 100.537] },
];

export function placeById(id: string): Place {
  const found = places.find((p) => p.id === id);
  if (!found) throw new Error(`unknown place: ${id}`);
  return found;
}

/**
 * A place the dish was logged, with its own range.
 *
 * What actually improves an estimate is that a fixed kitchen has a fixed
 * recipe, so its range is narrower than the catch-all. Naming where you ate is
 * therefore a real accuracy lever — and for a dish whose variance is your own
 * portion, it visibly is not.
 */
export type Venue = {
  name: string;
  /** the area, for context — not for navigation */
  area: string;
  logCount: number;
  kcalRange: [number, number];
  /** the unnamed catch-all bucket rather than a specific kitchen */
  generic?: boolean;
  /** links back to the map pin, absent for the catch-all bucket */
  placeId?: string;
};

/** A venue that is a real pin on the map — name and area come from the place. */
function atPlace(placeId: string, logCount: number, kcalRange: [number, number]): Venue {
  const p = placeById(placeId);
  return { name: p.name, area: p.area, logCount, kcalRange, placeId };
}

/** The unnamed catch-all: logs where nobody said where they were. */
function unnamed(label: string, logCount: number, kcalRange: [number, number]): Venue {
  return { name: label, area: "everywhere", logCount, kcalRange, generic: true };
}

export type Dish = {
  id: string;
  name: string;
  image: string;
  /** how many people in the community have logged it */
  logCount: number;
  kcalMedian: number;
  kcalRange: [number, number];
  proteinMedian: number;
  proteinRange: [number, number];
  /** confidence the community sample supports right now */
  confidence: Confidence;
  /** what a solo logger would have got with no community data */
  soloConfidence: Confidence;
  reducibility: Reducibility;
  /** the honest explanation of why the range is the width it is */
  varianceNote: string;
  /**
   * What the dish actually is, in nutritional terms. Secondary to the variance
   * explanation on purpose: knowing where the calories sit is interesting, but
   * knowing why the estimate is uncertain is what makes the next log better.
   */
  background: string;
  /** the one thing the user can say next time to narrow their own estimate */
  logTip: string;
  /** where the community logged it, each with its own range */
  venues?: Venue[];
  /** medical rule id this dish trips, if any */
  trips?: string;
};

export const dishes: Dish[] = [
  {
    id: "pad-thai",
    name: "Pad thai",
    image: "/feed/pad-thai.png",
    logCount: 412,
    kcalMedian: 720,
    kcalRange: [640, 810],
    proteinMedian: 29,
    proteinRange: [24, 34],
    confidence: "MEDIUM",
    soloConfidence: "LOW",
    reducibility: "reducible",
    varianceNote:
      "412 logs narrowed this from a 260 kcal spread to 170. The remaining width is mostly how much oil the stall uses, which we can keep chipping at.",
    background:
      "Rice noodles wok-fried with tamarind, palm sugar, fish sauce and egg. The sauce carries most of the carbohydrate, and the noodles absorb far more oil in a hot wok than the plate suggests.",
    logTip: "Name the stall. A fixed wok cuts this range roughly in half.",
    venues: [
      atPlace("wok-north", 89, [640, 695]),
      atPlace("noodle-oldtown", 74, [730, 795]),
      unnamed("Unnamed stalls", 249, [640, 810]),
    ],
  },
  {
    id: "shabu",
    name: "Shabu",
    image: "/feed/shabu.png",
    logCount: 289,
    kcalMedian: 1040,
    kcalRange: [700, 1400],
    proteinMedian: 74,
    proteinRange: [55, 95],
    confidence: "LOW",
    soloConfidence: "LOW",
    reducibility: "irreducible",
    varianceNote:
      "289 logs have not narrowed this and they never will. The variance is in how many plates you personally took, not in the dish. More data cannot see your table.",
    background:
      "Thin-sliced meat cooked at the table in simmering broth. The method is genuinely lean — almost nothing is added in cooking. What moves the number is the dipping sauce and the all-you-can-eat format, not the food itself.",
    logTip: "Plate count beats the restaurant name. A rough number of plates is the only thing that narrows this.",
    // Deliberately the same range at both venues. Naming the restaurant is
    // useless here, and showing two identical bars proves it better than a
    // sentence claiming it.
    venues: [atPlace("hotpot-chain", 121, [700, 1400]), unnamed("Unnamed", 168, [700, 1400])],
    trips: "red-meat-uric-acid",
  },
  {
    id: "protein-bowl",
    name: "Protein bowl",
    image: "/feed/protein-bowl.png",
    logCount: 631,
    kcalMedian: 540,
    kcalRange: [510, 570],
    proteinMedian: 47,
    proteinRange: [44, 50],
    confidence: "HIGH",
    soloConfidence: "HIGH",
    reducibility: "reducible",
    varianceNote:
      "A fixed recipe off a printed menu. This was already tight before the community touched it — the logs just confirm it.",
    background:
      "Grilled chicken, a grain base and greens, assembled to a specification. Chains weigh their components, which is the entire reason this is the tightest estimate on the board.",
    logTip: "Nothing to add. A printed recipe is already the best data we can get.",
    venues: [atPlace("salad-chain", 402, [525, 545]), unnamed("Unnamed", 229, [510, 570])],
  },
  {
    id: "som-tam",
    name: "Som tam",
    image: "/feed/som-tam.png",
    logCount: 356,
    kcalMedian: 165,
    kcalRange: [130, 200],
    proteinMedian: 6,
    proteinRange: [4, 9],
    confidence: "MEDIUM",
    soloConfidence: "MEDIUM",
    reducibility: "reducible",
    varianceNote:
      "Palm sugar is the whole variable and it is stall-specific. Logs tagged by stall would close this further.",
    background:
      "Green papaya pounded with lime, chilli, fish sauce and palm sugar. There is almost no fat in it — the calories are nearly all palm sugar, added by hand and to taste.",
    logTip: "Say whether you asked for less sugar. That single detail is most of the variance.",
    venues: [atPlace("isaan-row", 71, [135, 168]), unnamed("Unnamed stalls", 285, [130, 200])],
  },
  {
    id: "chicken-rice",
    name: "Chicken rice",
    image: "/feed/chicken-rice.png",
    logCount: 508,
    kcalMedian: 630,
    kcalRange: [575, 690],
    proteinMedian: 37,
    proteinRange: [32, 42],
    confidence: "MEDIUM",
    soloConfidence: "MEDIUM",
    reducibility: "reducible",
    varianceNote:
      "The rice is cooked in chicken fat and nobody measures it. Community volume has this as tight as it is likely to get without weighing.",
    background:
      "Poached chicken served with rice cooked in the rendered fat and stock. The rice is the calorie story here, not the chicken — which is why a smaller portion of rice moves this more than swapping the meat.",
    logTip: "Note if you left rice behind. Food you did not eat is invisible in everyone else's logs.",
    venues: [
      atPlace("hawker-centre", 118, [585, 640]),
      atPlace("kopitiam", 96, [625, 685]),
      unnamed("Unnamed", 294, [575, 690]),
    ],
  },
  {
    id: "boat-noodles",
    name: "Boat noodles",
    image: "/feed/boat-noodles.png",
    logCount: 147,
    kcalMedian: 380,
    kcalRange: [280, 520],
    proteinMedian: 21,
    proteinRange: [16, 28],
    confidence: "LOW",
    soloConfidence: "LOW",
    reducibility: "reducible",
    varianceNote:
      "Only 147 logs, and broth fat is invisible in a photo. This is the widest range on the board and the one most worth logging.",
    background:
      "Small bowls of noodle soup in a dark broth traditionally thickened with pork blood, which adds iron and body but very little fat. Portions are deliberately tiny — the format assumes you order several.",
    logTip: "Log the number of bowls, not just the dish. Bowl count is the whole variable.",
    venues: [atPlace("canal-stalls", 52, [300, 415]), unnamed("Unnamed", 95, [280, 520])],
  },
  {
    id: "mango-sticky-rice",
    name: "Mango sticky rice",
    image: "/feed/mango-sticky-rice.png",
    logCount: 274,
    kcalMedian: 450,
    kcalRange: [390, 510],
    proteinMedian: 5,
    proteinRange: [4, 7],
    confidence: "MEDIUM",
    soloConfidence: "MEDIUM",
    reducibility: "reducible",
    varianceNote: "Coconut cream is poured by hand, so the top of this range is real.",
    background:
      "Glutinous rice steamed with coconut cream and sugar, served with ripe mango. The rice and the pour of cream carry almost all of the calories; the fruit is the small part of it.",
    logTip: "Mention if the cream was poured at the table. Hand-poured means the top of the range.",
  },
  {
    id: "steak",
    name: "Steak",
    image: "/feed/steak.png",
    logCount: 198,
    kcalMedian: 790,
    kcalRange: [640, 980],
    proteinMedian: 64,
    proteinRange: [52, 78],
    confidence: "MEDIUM",
    soloConfidence: "MEDIUM",
    reducibility: "irreducible",
    varianceNote:
      "Cut and trim drive this and they differ per plate. Other people's ribeyes do not describe yours.",
    background:
      "Beef, salt, heat. Nutritionally about as simple as food gets — the numbers swing entirely on cut and trim, from a lean fillet to a heavily marbled ribeye, plus whether it was finished in butter.",
    logTip: "Name the cut and a rough weight. Nothing else meaningfully moves this number.",
    trips: "red-meat-uric-acid",
  },
];

const span = (r: [number, number]) => r[1] - r[0];

/**
 * The narrowest named venue — but only when naming the place genuinely buys
 * accuracy. For a dish whose variance is your own portion, every venue carries
 * the same width, so this returns null and the UI says naming it would not
 * help rather than implying it would.
 */
export function tightestVenue(d: Dish): Venue | null {
  const named = (d.venues ?? []).filter((v) => !v.generic);
  if (named.length === 0) return null;

  const best = named.reduce((a, b) => (span(b.kcalRange) < span(a.kcalRange) ? b : a));
  const generic = (d.venues ?? []).find((v) => v.generic);

  // Within 5% of the catch-all is not an improvement worth claiming.
  if (generic && span(best.kcalRange) >= span(generic.kcalRange) * 0.95) return null;
  return best;
}

/** How much narrower the best named venue is than the unnamed bucket, as a %. */
export function venueGain(d: Dish): number | null {
  const best = tightestVenue(d);
  const generic = (d.venues ?? []).find((v) => v.generic);
  if (!best || !generic) return null;
  return Math.round((1 - span(best.kcalRange) / span(generic.kcalRange)) * 100);
}

export function dishById(id: string): Dish {
  const found = dishes.find((d) => d.id === id);
  if (!found) throw new Error(`unknown dish: ${id}`);
  return found;
}

/** The macros an "I ate this too" tap should log — the community median + range. */
export function dishMacros(d: Dish): Macros {
  return {
    kcal: d.kcalMedian,
    protein_g: d.proteinMedian,
    // Rough splits; the ranges are the honest part and those are real.
    carbs_g: Math.round((d.kcalMedian * 0.45) / 4),
    fat_g: Math.round((d.kcalMedian * 0.3) / 9),
    ...(d.confidence === "HIGH"
      ? {}
      : { kcal_range: d.kcalRange, protein_range: d.proteinRange }),
  };
}

/* ------------------------------------------------------------------ *
 * People
 *
 * Streaks are deliberately "logged 12 of the last 14 days" rather than an
 * unbroken-chain counter. A chain that breaks makes people stop logging, and
 * the engine needs the honest log far more than it needs a tidy number.
 * ------------------------------------------------------------------ */

export type Author = {
  id: string;
  name: string;
  handle: string;
  /** initials stand in for an avatar — no invented faces */
  initials: string;
  city: string;
  loggedDays: number;
  ofDays: number;
};

export const authors: Author[] = [
  { id: "mai", name: "Mai T.", handle: "maithanya", initials: "MT", city: "Bangkok", loggedDays: 13, ofDays: 14 },
  { id: "arun", name: "Arun P.", handle: "arunp", initials: "AP", city: "Bangkok", loggedDays: 9, ofDays: 14 },
  { id: "jo", name: "Jo L.", handle: "jolim", initials: "JL", city: "Singapore", loggedDays: 14, ofDays: 14 },
  { id: "deng", name: "Deng W.", handle: "dengw", initials: "DW", city: "Chiang Mai", loggedDays: 6, ofDays: 14 },
  { id: "sara", name: "Sara K.", handle: "sarak", initials: "SK", city: "Bangkok", loggedDays: 11, ofDays: 14 },
];

export function authorById(id: string): Author {
  const found = authors.find((a) => a.id === id);
  if (!found) throw new Error(`unknown author: ${id}`);
  return found;
}

/* ------------------------------------------------------------------ */

export type FeedPost = {
  id: string;
  authorId: string;
  dishId: string;
  time: string;
  caption: string;
  /** how many people tapped "I ate this too" on this post */
  alsoAte: number;
  /**
   * Set when the post is worth showing because the person was honest about
   * something awkward, not because the meal was impressive. The feed ranks on
   * honesty, which is the only ranking that helps the engine.
   */
  honestyNote?: string;
};

export const feedPosts: FeedPost[] = [
  {
    id: "p1",
    authorId: "mai",
    dishId: "shabu",
    time: "20:40",
    caption: "Team dinner. Lost count somewhere around plate six.",
    alsoAte: 31,
    honestyNote:
      "Logged at the top of the range rather than the middle. Mai does not know how much she ate and said so.",
  },
  {
    id: "p2",
    authorId: "jo",
    dishId: "protein-bowl",
    time: "12:15",
    caption: "Same desk lunch as always. Boring works.",
    alsoAte: 88,
  },
  {
    id: "p3",
    authorId: "deng",
    dishId: "boat-noodles",
    time: "13:05",
    caption: "Two small bowls, not one. Logging both.",
    alsoAte: 12,
    honestyNote: "Second bowl declared unprompted. That is the whole game.",
  },
  {
    id: "p4",
    authorId: "arun",
    dishId: "pad-thai",
    time: "19:20",
    caption: "Wok stall up on the north lane. Extra peanuts.",
    alsoAte: 44,
  },
  {
    id: "p5",
    authorId: "sara",
    dishId: "mango-sticky-rice",
    time: "21:10",
    caption: "Went over today and I am not going to pretend otherwise.",
    alsoAte: 27,
    honestyNote: "Logged after going over target. The overshoot is in her log, not hidden from it.",
  },
  {
    id: "p6",
    authorId: "mai",
    dishId: "som-tam",
    time: "11:50",
    caption: "Light lunch before training.",
    alsoAte: 19,
  },
  {
    id: "p7",
    authorId: "jo",
    dishId: "chicken-rice",
    time: "12:40",
    caption: "Asked them to go easy on the rice. No idea if they did.",
    alsoAte: 36,
    honestyNote: "Flagged that the request may have been ignored, so the estimate stays wide.",
  },
];

/* ------------------------------------------------------------------ *
 * Check-in map — DNA Block 6
 *
 * Block 6 specifies a "virtual activity map, friends see where you plan to go /
 * went, momentum & social accountability". The two statuses are not decoration
 * of one another, and the *planned* half is the one that earns the feature:
 *
 *   - "went" is history. It is what feeds the per-venue ranges above.
 *   - "planned" is actionable. A restaurant the system knows about in advance
 *     stops being scenario S1 (plan breaks with zero notice, widest possible
 *     estimate) and becomes something the engine can prepare for — which is the
 *     difference between guessing at a photo afterwards and having a target for
 *     the meal before it happens.
 *
 * This is also why joining a plan must not log anything: nothing has been eaten
 * yet. Per DNA §4.12 the system proposes and the user disposes, so a join
 * produces a pre-plan proposal, never a silent entry in the log.
 * ------------------------------------------------------------------ */

/** [ASSUMPTION] The city the demo map is centred on, with invented coordinates. */
export const mapCity = { name: "Bangkok", center: [13.7555, 100.532] as [number, number] };

export type CheckIn = {
  id: string;
  authorId: string;
  placeId: string;
  dishId: string;
  status: "planned" | "went";
  /** clock time for "went", a human label like "tomorrow 12:30" for "planned" */
  time: string;
};

export const checkIns: CheckIn[] = [
  { id: "c1", authorId: "arun", placeId: "wok-north", dishId: "pad-thai", status: "went", time: "19:20" },
  { id: "c2", authorId: "mai", placeId: "hotpot-chain", dishId: "shabu", status: "went", time: "20:40" },
  { id: "c3", authorId: "mai", placeId: "isaan-row", dishId: "som-tam", status: "went", time: "11:50" },
  { id: "c4", authorId: "sara", placeId: "kopitiam", dishId: "chicken-rice", status: "went", time: "12:40" },
  // The three planned ones carry the demo's argument. The hotpot plan is
  // deliberately a dish that trips a medical rule, so the map can surface the
  // rule BEFORE the meal instead of scoring it afterwards.
  { id: "c5", authorId: "sara", placeId: "salad-chain", dishId: "protein-bowl", status: "planned", time: "tomorrow 12:30" },
  { id: "c6", authorId: "arun", placeId: "hotpot-chain", dishId: "shabu", status: "planned", time: "tomorrow 19:00" },
  { id: "c7", authorId: "mai", placeId: "canal-stalls", dishId: "boat-noodles", status: "planned", time: "tomorrow 13:00" },
];

/**
 * Friends who log from other cities. Surfaced as a plain count rather than
 * dropped silently, so the map does not imply the whole community is here.
 */
export function friendsElsewhere(): number {
  const onMap = new Set(checkIns.map((c) => c.authorId));
  return authors.filter((a) => !onMap.has(a.id) || a.city !== mapCity.name).length;
}

export function checkInsAtPlace(placeId: string): CheckIn[] {
  return checkIns.filter((c) => c.placeId === placeId);
}

/** Planned check-ins are the actionable ones, so they lead the list. */
export function plannedCheckIns(): CheckIn[] {
  return checkIns.filter((c) => c.status === "planned");
}
