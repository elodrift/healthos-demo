/**
 * Deterministic intent matcher. No network, no model.
 *
 * Why this exists at all: a stranger types whatever they want. Anything that
 * touches a medical rule, a target number, or the meal log has to be answered
 * deterministically — a probabilistic model must never be the thing that decides
 * whether grapefruit is safe. So the matcher owns every intent with
 * consequences, and only genuinely open-ended chat falls through to the model.
 *
 * Recovered from the deleted demo (commit da33172^). It runs **server-side** now
 * rather than in the browser: the client can no longer be trusted to classify
 * its own input, because the classification decides whether a medical branch is
 * taken. Keeping it on the server also keeps the food table out of the bundle.
 *
 * Pure and dependency-free by design, so `npm run test:agent` can exercise every
 * branch without a database, a session, or a model.
 */

/*
 * Declared here rather than imported from `lib/events.ts`, which was deleted
 * with the scripted demo; that module carried fixture concerns this file does
 * not need.
 *
 * `Confidence` stays qualitative (LOW/MEDIUM/HIGH), matching `meal_log`, instead
 * of a numeric score. §4.11 forbids inventing precision, and "72% sure" about a
 * street-food portion is exactly that invention.
 */
export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Present only when the estimate genuinely is a range, not a point value. */
  kcal_range?: [number, number];
  protein_range?: [number, number];
};

export type IntentKind =
  | "log_meal"
  | "ask_remaining"
  | "ask_what_to_eat"
  | "skipped_training"
  | "trained_harder"
  | "medical_check"
  | "ask_why"
  | "eating_out"
  | "alcohol"
  | "share"
  // The realistic long tail. These were falling through to the model, which
  // answered them with exactly the register this product is arguing against
  // ("maintain your calorie and protein goals"). They have consequences for
  // trust even when they have none for the numbers, so they are written here.
  | "low_motivation"
  | "temptation"
  | "schedule_change"
  | "diet_trend"
  | "illness"
  | "weight_stalled"
  | "greeting"
  | "thanks"
  | "unknown";

export type FoodGuess = {
  label: string;
  macros: Macros;
  confidence: Confidence;
  /** what made the estimate uncertain, in the product's own voice */
  note: string;
  /**
   * Marks the dish as medically sensitive — a topic on which this system must
   * defer, not decide.
   *
   * In the deleted demo these ids ("grapefruit-amlodipine") indexed a rules
   * table that adjudicated safety. That table no longer exists, and the id is
   * deliberately NOT reconnected to one: today the only medical input we hold is
   * `onboarding_profile.medicalNotes`, which is free text. Deriving a drug
   * interaction from free text and stating it as fact is precisely the
   * fabrication §4.11 forbids.
   *
   * So the id now means "refuse and surface", per DNA principle 12: overriding a
   * hard medical rule is "refused and surfaced, never silently done". The
   * responder cites the interaction as *a thing to check with a clinician*,
   * never as a verdict it reached itself.
   */
  trips?: string;
};

export type Intent = {
  kind: IntentKind;
  /** 0..1 — how sure the matcher is. Below THRESHOLD we hand off to the model. */
  score: number;
  food?: FoodGuess;
  /** the raw phrase that matched, for the engine log's cause string */
  matched?: string;
};

export const HANDOFF_THRESHOLD = 0.5;

/* ------------------------------------------------------------------ *
 * Food table
 *
 * Deliberately regional — this is a Bangkok demo, and someone typing
 * "som tam" or "shabu" should be understood, not shrugged at. Ranges are
 * wide on purpose: a street-food portion genuinely is uncertain, and the
 * product's whole posture is to show that instead of inventing a number.
 * ------------------------------------------------------------------ */

type FoodEntry = {
  keys: string[];
  label: string;
  kcal: [number, number];
  protein: [number, number];
  carbs: number;
  fat: number;
  confidence: Confidence;
  note: string;
  trips?: string;
};

const FOODS: FoodEntry[] = [
  {
    keys: ["pad thai", "padthai", "phad thai"],
    label: "Pad thai",
    kcal: [620, 880],
    protein: [24, 34],
    carbs: 96,
    fat: 26,
    confidence: "LOW",
    note: "street portions swing hard, and the oil is never the same twice",
  },
  {
    keys: ["som tam", "somtam", "papaya salad"],
    label: "Som tam",
    kcal: [120, 210],
    protein: [4, 9],
    carbs: 24,
    fat: 4,
    confidence: "MEDIUM",
    note: "palm sugar varies by stall",
  },
  {
    keys: ["shabu", "hotpot", "hot pot", "sukiyaki"],
    label: "Shabu",
    kcal: [700, 1400],
    protein: [55, 95],
    carbs: 48,
    fat: 62,
    confidence: "LOW",
    note: "all-you-can-eat — I cannot see how many plates you actually ate",
    trips: "red-meat-uric-acid",
  },
  {
    keys: ["steak", "ribeye", "rib eye", "wagyu", "sirloin", "beef"],
    label: "Steak",
    kcal: [640, 980],
    protein: [52, 78],
    carbs: 6,
    fat: 58,
    confidence: "MEDIUM",
    note: "cut and trim unknown",
    trips: "red-meat-uric-acid",
  },
  {
    keys: ["chicken rice", "khao man gai"],
    label: "Chicken rice",
    kcal: [560, 720],
    protein: [32, 42],
    carbs: 78,
    fat: 18,
    confidence: "MEDIUM",
    note: "the rice is cooked in fat — quantity unknown",
  },
  {
    keys: ["protein bowl", "chicken bowl", "salad bowl", "grain bowl", "poke"],
    label: "Protein bowl",
    kcal: [480, 620],
    protein: [42, 52],
    carbs: 44,
    fat: 16,
    confidence: "HIGH",
    note: "logged from the menu",
  },
  {
    keys: ["mango sticky rice", "sticky rice", "khao niao"],
    label: "Mango sticky rice",
    kcal: [380, 520],
    protein: [4, 7],
    carbs: 78,
    fat: 12,
    confidence: "MEDIUM",
    note: "coconut cream is the variable",
  },
  {
    keys: ["grapefruit", "pomelo juice", "som o juice"],
    label: "Grapefruit",
    kcal: [70, 110],
    protein: [1, 2],
    carbs: 22,
    fat: 0,
    confidence: "HIGH",
    note: "flagged before logging",
    trips: "grapefruit-amlodipine",
  },
  {
    keys: ["latte", "coffee", "cappuccino", "flat white"],
    label: "Latte",
    kcal: [120, 220],
    protein: [6, 12],
    carbs: 18,
    fat: 8,
    confidence: "MEDIUM",
    note: "milk and syrup unknown",
  },
  {
    keys: ["eggs", "egg", "omelette", "omelet"],
    label: "Eggs",
    kcal: [140, 260],
    protein: [12, 20],
    carbs: 2,
    fat: 16,
    confidence: "HIGH",
    note: "counted",
  },
  {
    keys: ["yoghurt", "yogurt", "greek yog"],
    label: "Greek yoghurt",
    kcal: [130, 200],
    protein: [14, 22],
    carbs: 12,
    fat: 6,
    confidence: "HIGH",
    note: "logged from the label",
  },
  {
    keys: ["noodle", "ramen", "boat noodle", "kuay teow"],
    label: "Noodles",
    kcal: [480, 760],
    protein: [22, 34],
    carbs: 84,
    fat: 22,
    confidence: "LOW",
    note: "broth fat is invisible to me",
  },
  {
    keys: ["fried chicken", "karaage", "nuggets", "gai tod"],
    label: "Fried chicken",
    kcal: [420, 700],
    protein: [26, 38],
    carbs: 32,
    fat: 38,
    confidence: "LOW",
    note: "batter and fry oil unknown",
  },
  {
    keys: ["curry", "green curry", "massaman", "gaeng"],
    label: "Thai curry",
    kcal: [520, 820],
    protein: [22, 36],
    carbs: 62,
    fat: 42,
    confidence: "LOW",
    note: "coconut milk quantity unknown",
  },
  {
    keys: ["salmon", "fish", "sashimi"],
    label: "Salmon",
    kcal: [340, 480],
    protein: [36, 48],
    carbs: 2,
    fat: 26,
    confidence: "MEDIUM",
    note: "portion estimated",
  },
  {
    keys: ["protein shake", "whey", "shake"],
    label: "Protein shake",
    kcal: [140, 190],
    protein: [26, 32],
    carbs: 6,
    fat: 3,
    confidence: "HIGH",
    note: "logged from the label",
  },
];

const ALCOHOL = ["beer", "wine", "cocktail", "whisky", "whiskey", "vodka", "gin", "sake", "drinks", "alcohol"];

function mid([a, b]: [number, number]): number {
  return Math.round((a + b) / 2);
}

function toGuess(entry: FoodEntry): FoodGuess {
  return {
    label: entry.label,
    confidence: entry.confidence,
    note: entry.note,
    trips: entry.trips,
    macros: {
      kcal: mid(entry.kcal),
      protein_g: mid(entry.protein),
      carbs_g: entry.carbs,
      fat_g: entry.fat,
      // Only carry a range when the number genuinely is one. HIGH-confidence
      // logs get a point value so the UI doesn't hatch something we do know.
      ...(entry.confidence === "HIGH"
        ? {}
        : { kcal_range: entry.kcal, protein_range: entry.protein }),
    },
  };
}

function findFood(text: string): FoodEntry | null {
  // longest key first so "mango sticky rice" beats "sticky rice"
  const hits = FOODS.flatMap((f) =>
    f.keys.filter((k) => text.includes(k)).map((k) => ({ f, len: k.length })),
  ).sort((a, b) => b.len - a.len);
  return hits[0]?.f ?? null;
}

function any(text: string, phrases: string[]): string | null {
  return phrases.find((p) => text.includes(p)) ?? null;
}

/** Rough check for "did they name a food at all", used to log unknown dishes. */
const ATE_VERBS = [
  "i ate",
  "i had",
  "just ate",
  "just had",
  "ate a",
  "ate some",
  "had a",
  "had some",
  "eating",
  "log ",
  "logged",
  "for lunch",
  "for dinner",
  "for breakfast",
];

export function classify(raw: string): Intent {
  const text = ` ${raw.toLowerCase().trim()} `;

  // ---- Medical questions first, always. This branch must win over food
  // logging: "can I have steak" is a safety question, not a log.
  const askingPermission = any(text, [
    "can i have",
    "can i eat",
    "am i allowed",
    "is it ok",
    "is it okay",
    "is that ok",
    "safe to",
    "is it safe",
    "should i avoid",
    "allowed to",
  ]);
  /*
   * Medical *vocabulary*, independent of phrasing.
   *
   * Added because `scripts/test-agent.ts` found a real hole: the checks above key
   * on asking-permission phrasing, so "does red meat affect my uric acid" and
   * "is this ok with my medication" matched nothing and fell through to the
   * model. A question about a drug interaction answered by an LLM in this
   * product's authoritative voice is exactly what DNA principle 12 forbids, and
   * phrasing is the wrong thing to gate safety on — a user asks about their
   * medication however they like.
   *
   * So any mention of medication, a named drug class, or a clinical marker claims
   * the turn regardless of sentence shape. This over-triggers by design: the cost
   * of wrongly deferring a harmless question is one unnecessary "ask your
   * pharmacist", while the cost of missing one is a fabricated medical claim.
   */
  const medicalVocab = any(text, [
    "medication",
    "medications",
    "meds",
    "my prescription",
    "prescribed",
    "statin",
    "amlodipine",
    "metformin",
    "warfarin",
    "beta blocker",
    "blood thinner",
    "blood pressure med",
    "uric acid",
    "gout",
    "cholesterol",
    "blood sugar",
    "insulin",
    "kidney",
    "liver",
    "thyroid",
    "interact",
    "interaction",
    "contraindicat",
  ]);

  const food = findFood(text);
  if (askingPermission || medicalVocab || (food?.trips && !any(text, ATE_VERBS))) {
    return {
      kind: "medical_check",
      score: 1,
      food: food ? toGuess(food) : undefined,
      matched: askingPermission ?? medicalVocab ?? food?.label,
    };
  }

  const trainingSkip = any(text, [
    "skip training",
    "skipped training",
    "skip the gym",
    "skipped the gym",
    "skipping training",
    "skipped my workout",
    "missed training",
    "missed the gym",
    "no gym",
    "didn't train",
    "didnt train",
    "did not train",
    "no training",
    "couldn't train",
    "couldnt train",
    "work exploded",
  ]);
  if (trainingSkip) return { kind: "skipped_training", score: 1, matched: trainingSkip };

  const trainedMore = any(text, [
    "trained twice",
    "extra session",
    "went hard",
    "double session",
    "trained harder",
    "smashed the gym",
    "pr'd",
    "ran 10k",
    "long run",
  ]);
  if (trainedMore) return { kind: "trained_harder", score: 1, matched: trainedMore };

  const why = any(text, [
    "why did you",
    "why is",
    "why are",
    "why the",
    "how did you",
    "how do you know",
    "explain",
    "what changed",
    "says who",
    "based on what",
  ]);
  if (why) return { kind: "ask_why", score: 0.95, matched: why };

  const remaining = any(text, [
    "how much left",
    "how much have i",
    "what's left",
    "whats left",
    "how am i doing",
    "where am i",
    "am i on track",
    "status",
    "remaining",
    "how many calories",
    "how much protein",
    "my numbers",
    "today so far",
  ]);
  if (remaining) return { kind: "ask_remaining", score: 1, matched: remaining };

  const suggest = any(text, [
    "what should i eat",
    "what can i eat",
    "what do i eat",
    "suggest",
    "recommend",
    "any ideas",
    "what's for dinner",
    "whats for dinner",
    "i'm hungry",
    "im hungry",
    "options",
    "what to order",
  ]);
  if (suggest) return { kind: "ask_what_to_eat", score: 1, matched: suggest };

  const drink = any(text, ALCOHOL);
  if (drink) return { kind: "alcohol", score: 0.9, matched: drink };

  const out = any(text, [
    "restaurant",
    "dinner out",
    "eating out",
    "birthday",
    "with friends",
    "team dinner",
    "date night",
    "wedding",
    "buffet",
  ]);
  if (out) return { kind: "eating_out", score: 0.85, matched: out };

  const share = any(text, ["share", "post this", "story", "instagram", "insta", "ig ", "feed"]);
  if (share) return { kind: "share", score: 0.9, matched: share };

  /* ---- The long tail, checked before food logging: "craving pad thai" is
   * not a meal to log, and "I feel pointless" must never be answered with a
   * macro reminder. ---- */

  const lowMotivation = any(text, [
    "pointless",
    "what's the point",
    "whats the point",
    "give up",
    "giving up",
    "can't be bothered",
    "cant be bothered",
    "no motivation",
    "unmotivated",
    "depressed",
    "exhausted",
    "burnt out",
    "burned out",
    "hate my body",
    "hate this",
    "failing",
    "i failed",
    "not working",
    "waste of time",
    "breakup",
    "broke up",
    "divorce",
    "stressed",
    "overwhelmed",
    "anxious",
    "sad",
    "lonely",
  ]);
  if (lowMotivation) return { kind: "low_motivation", score: 0.9, matched: lowMotivation };

  const temptation = any(text, [
    "craving",
    "crave",
    "no willpower",
    "willpower",
    "tempted",
    "temptation",
    "keeps buying",
    "keep buying",
    "junk food",
    "biscuits",
    "cookies",
    "chocolate",
    "sweets",
    "candy",
    "crisps",
    "chips in the house",
    "snacking",
    "can't stop eating",
    "cant stop eating",
    "binge",
    "cheat meal",
    "cheat day",
  ]);
  if (temptation) return { kind: "temptation", score: 0.85, matched: temptation };

  const schedule = any(text, [
    "night shift",
    "nights",
    "graveyard",
    "shift work",
    "work nights",
    "new job",
    "travelling",
    "traveling",
    "flying",
    "flight",
    "jet lag",
    "jetlag",
    "time zone",
    "timezone",
    "different hours",
    "schedule changed",
    "ramadan",
    "fasting for religious",
  ]);
  if (schedule) return { kind: "schedule_change", score: 0.85, matched: schedule };

  const trend = any(text, [
    "fasting",
    "intermittent",
    "keto",
    "ketogenic",
    "carnivore",
    "paleo",
    "cleanse",
    "detox",
    "juice diet",
    "low carb",
    "carb cycling",
    "vegan",
    "vegetarian",
    "atkins",
    "whole30",
    "weight loss pill",
    "ozempic",
    "supplement",
    "creatine",
    "fat burner",
  ]);
  if (trend) return { kind: "diet_trend", score: 0.85, matched: trend };

  const ill = any(text, [
    "sick",
    "ill ",
    "flu",
    "fever",
    "cold",
    "covid",
    "food poisoning",
    "vomit",
    "throwing up",
    "no appetite",
    "can't eat",
    "cant eat",
    "migraine",
    "injured",
    "injury",
    "hurt my",
  ]);
  if (ill) return { kind: "illness", score: 0.85, matched: ill };

  const stalled = any(text, [
    "not losing",
    "stopped losing",
    "plateau",
    "stalled",
    "scale hasn't",
    "scale hasnt",
    "gained weight",
    "putting on weight",
    "weight went up",
    "no progress",
    "stuck at",
    "same weight",
    "hasn't moved",
    "hasnt moved",
    "haven't lost",
    "havent lost",
    "not shifting",
    "nothing's changed",
    "nothings changed",
  ]);
  if (stalled) return { kind: "weight_stalled", score: 0.9, matched: stalled };

  // ---- Food logging. Either we recognised the dish, or they clearly told us
  // they ate something we don't know — both are logs, the second is just LOW.
  const ateVerb = any(text, ATE_VERBS);
  if (food) {
    return { kind: "log_meal", score: 1, food: toGuess(food), matched: food.label };
  }
  if (ateVerb) {
    const label = guessLabel(raw) ?? "Unrecognised meal";
    return {
      kind: "log_meal",
      score: 0.6,
      matched: ateVerb,
      food: {
        label,
        confidence: "LOW",
        note: "I do not have this dish — the range is deliberately wide",
        macros: {
          kcal: 550,
          protein_g: 28,
          carbs_g: 55,
          fat_g: 24,
          kcal_range: [350, 850],
          protein_range: [15, 45],
        },
      },
    };
  }

  const thanks = any(text, ["thanks", "thank you", "cheers", "appreciate", "nice one", "got it"]);
  if (thanks) return { kind: "thanks", score: 0.9, matched: thanks };

  const hello = any(text, ["hello", "hi ", "hey", "morning", "good evening", "yo "]);
  if (hello) return { kind: "greeting", score: 0.8, matched: hello };

  return { kind: "unknown", score: 0 };
}

/** Pull a plausible dish name out of "I had a chicken caesar wrap for lunch". */
function guessLabel(raw: string): string | null {
  const m = raw
    .toLowerCase()
    .match(/(?:i ate|i had|just ate|just had|ate|had|logged|log)\s+(?:a|an|some|the)?\s*([^.,!?]{2,40})/);
  if (!m) return null;
  const cleaned = m[1]
    .replace(/\s+for\s+(lunch|dinner|breakfast|a snack).*$/, "")
    .replace(/\s+(today|just now|earlier|at work)\s*$/, "")
    .trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
