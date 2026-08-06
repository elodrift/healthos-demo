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
 */

import type { Confidence, Macros } from "@/lib/events";

export type Reducibility = "reducible" | "irreducible";

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
    trips: "red-meat-uric-acid",
  },
];

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
    caption: "Corner stall on Soi 38. Extra peanuts.",
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
