/**
 * Food recognition from a photo.
 *
 * The output of this module is an *estimate*, and every type here is shaped to
 * keep that fact attached to the number. There is no code path that returns a
 * bare kcal figure: a caller must handle the confidence and the failure
 * variants to get at it. That is deliberate — the app's whole argument is that
 * it does not invent numbers, and a vision model guessing at a plate of food is
 * exactly where an invented number would slip in.
 *
 * Nothing here writes to the database. Recognition proposes; the user confirms.
 */

import { generateObject } from "ai";
import { z } from "zod";

/**
 * Tried in order, first that answers wins.
 *
 * This order is measured, not assumed. On this project's current AI Gateway
 * tier, every gemini-3.x model — including gemini-3-flash — returns
 * "Free tier users do not have access to this model", and gpt-4o-mini is
 * rate-limited rather than blocked. So the list leads with the newest Gemini
 * vision model that actually answers today.
 *
 * If paid credits are added, promote "google/gemini-3.6-flash" to the front:
 * it is the better estimator and the rest of this file needs no changes. The
 * fallback chain is what makes that safe to get wrong in either direction.
 */
const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  // Works, but free-tier rate limits make it unreliable as a primary.
  "openai/gpt-4o-mini",
] as const;

/**
 * Plausibility bounds for a single meal.
 *
 * A model that returns 50,000 kcal has malfunctioned, and silently passing that
 * into a day's totals would be worse than admitting the photo failed. These are
 * generous on purpose: the goal is to catch nonsense, not to second-guess a
 * genuinely large meal.
 */
const LIMITS = {
  kcal: 2500,
  protein: 250,
  carbs: 400,
  fat: 200,
} as const;

const ItemSchema = z.object({
  name: z.string().min(1).max(80).describe("Short dish name as a person would say it, e.g. 'boat noodles'"),
  portion: z.string().min(1).max(80).describe("The portion you can actually see, e.g. 'one medium bowl'"),
  kcal: z.number().int().min(0),
  protein: z.number().int().min(0).describe("grams"),
  carbs: z.number().int().min(0).describe("grams"),
  fat: z.number().int().min(0).describe("grams"),
});

const ResponseSchema = z.object({
  isFood: z.boolean().describe("False if the photo is not food at all"),
  items: z.array(ItemSchema).max(6),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high: clearly identifiable dish and portion. medium: dish is clear, portion is a guess. low: obscured, mixed, or unfamiliar food.",
    ),
  caveat: z
    .string()
    .max(160)
    .describe("One short plain-language sentence on what you could not tell from the photo. Empty string if nothing."),
});

export type RecognizedItem = z.infer<typeof ItemSchema>;

/**
 * Every outcome is named. A caller cannot accidentally treat a failure as a
 * zero-calorie meal, which is the specific bug this shape exists to prevent.
 */
export type RecognitionResult =
  | {
      kind: "recognized";
      items: RecognizedItem[];
      totals: { kcal: number; protein: number; carbs: number; fat: number };
      confidence: "high" | "medium" | "low";
      caveat: string;
      model: string;
    }
  | { kind: "not-food" }
  | { kind: "implausible"; reason: string }
  | { kind: "unavailable" };

const SYSTEM = [
  "You estimate the nutrition of food from a photo.",
  "",
  "Estimate only what is visible. Do not assume hidden ingredients, cooking oil you cannot see, or side dishes outside the frame.",
  "If the portion size is ambiguous, say so in the caveat and set confidence to medium or low rather than guessing precisely.",
  "Prefer round numbers. False precision (e.g. 437 kcal) implies a measurement you did not make.",
  "If the photo is not food, set isFood to false and return an empty items array.",
  "Never refuse. If the food is unfamiliar, give your best estimate and set confidence to low.",
].join("\n");

/**
 * @param image  Raw image bytes. Expected to be metadata-stripped already —
 *               this runs after the stripper, so a photo's GPS never reaches
 *               a third-party model.
 */
export async function recognizeFood(image: Buffer, mediaType: string): Promise<RecognitionResult> {
  for (const model of MODELS) {
    try {
      const { object } = await generateObject({
        model,
        schema: ResponseSchema,
        // The SDK default is 3 attempts per model. With three models that is
        // nine round trips, which measured at 22s against a rate-limited
        // gateway — past the route's budget, so the user would see a timeout
        // instead of the "type it in yourself" fallback. One attempt each keeps
        // the whole chain inside a few seconds.
        maxRetries: 1,
        // Not optional for this app. The gateway "does not route based on the
        // training data policy of providers" by default, and assumes a provider
        // trains on your data unless it has an agreement saying otherwise — so
        // without this flag, photographs of users' meals (and their kitchens,
        // hands, and dining companions) are training data. It costs nothing.
        //
        // The tradeoff is real and deliberate: if no compliant provider serves a
        // model, that request fails with 400 no_providers_available rather than
        // silently routing to a training provider. That is the correct failure —
        // the chain moves to the next model, and if none qualify the user is
        // asked to type the meal in. Privacy fails closed, not open.
        providerOptions: {
          gateway: { disallowPromptTraining: true },
        },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What food is in this photo, and roughly what does it contain?" },
              // v7 shape: the `image` part is deprecated in favour of `file`.
              { type: "file", mediaType, data: image },
            ],
          },
        ],
      });

      if (!object.isFood || object.items.length === 0) return { kind: "not-food" };

      const totals = object.items.reduce(
        (acc, i) => ({
          kcal: acc.kcal + i.kcal,
          protein: acc.protein + i.protein,
          carbs: acc.carbs + i.carbs,
          fat: acc.fat + i.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      );

      for (const [key, cap] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
        if (totals[key] > cap) {
          return {
            kind: "implausible",
            reason: `Estimated ${totals[key]}${key === "kcal" ? " kcal" : "g " + key} for one meal, which is past what this can sensibly read.`,
          };
        }
      }

      return {
        kind: "recognized",
        items: object.items,
        totals,
        confidence: object.confidence,
        caveat: object.caveat.trim(),
        model,
      };
    } catch (error) {
      console.error(`[v0] recognizeFood: ${model} failed`, error instanceof Error ? error.message : error);
      // Try the next model rather than failing the upload.
    }
  }

  return { kind: "unavailable" };
}
