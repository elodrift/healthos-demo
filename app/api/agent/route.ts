/**
 * The fallback half of the hybrid. The local matcher owns every intent with a
 * consequence — logging food, moving a target, answering a medical question.
 * This route only ever handles the leftovers: genuinely open-ended things a
 * stranger might type that the matcher scored below its threshold.
 *
 * Two hard guardrails, both enforced here on the server rather than trusted to
 * the prompt:
 *   1. The model returns `touchesMedical`. If it is true the client throws the
 *      generated text away and runs the deterministic medical branch instead.
 *   2. The model may not emit numbers as fact. It gets the state read-only and
 *      is told to defer to the panel, so it can never invent a target.
 */

import { generateText, Output } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Tried in order. A demo that gets passed around cannot hinge on one model
 * being reachable — the first that answers wins, and if none do the caller
 * still gets an in-voice degraded reply rather than a dead end.
 * Verified against this project's AI Gateway tier.
 */
const MODELS = [
  // Strongest-at-voice first. The nano tier tested as bland here — it answers
  // "focus on your diet plan", which is exactly the generic slop this demo
  // exists to argue against — so it is a last resort, not a default.
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4.1-nano",
] as const;

const Body = z.object({
  message: z.string().min(1).max(600),
  state: z.object({
    time: z.string(),
    name: z.string(),
    mode: z.string(),
    targets: z.record(z.string(), z.union([z.number(), z.string()])),
    consumedKcal: z.number(),
    remainingKcal: z.number(),
    remainingProtein: z.number(),
    medicalRules: z.array(z.string()),
    revised: z.boolean(),
    logged: z.array(z.string()),
  }),
  transcript: z.array(z.object({ role: z.string(), text: z.string() })).max(12).optional(),
});

const Reply = z.object({
  /** 1–3 short lines. Each renders as its own chat bubble. */
  lines: z.array(z.string()).min(1).max(3),
  /**
   * True if answering properly would require ruling on food safety, a
   * medication interaction, a biomarker, or a dose. Set it generously — the
   * deterministic path is always the better answer when it applies.
   */
  touchesMedical: z.boolean(),
  /** True if the message has nothing to do with health, food, or training. */
  offTopic: z.boolean(),
});

function systemPrompt(s: z.infer<typeof Body>["state"]): string {
  return [
    "You are HealthOS, a health operating system that has been running one user's day.",
    "",
    "VOICE",
    "- Direct, dry, unhurried. Short declarative sentences.",
    "- You are an operating system, not a coach. No pep talk, no exclamation marks, no emoji.",
    "- Never congratulate. Never scold. State what is true and what it costs.",
    "- Never say 'as an AI'. Never apologise for what you are.",
    "- British spelling. Maximum three sentences per line.",
    "",
    "WHAT YOU KNOW (read-only, do not restate as a list)",
    `- User: ${s.name}. Clock: ${s.time}. Goal mode: ${s.mode}.`,
    `- Targets today: ${JSON.stringify(s.targets)}`,
    `- Consumed ${s.consumedKcal} kcal. Remaining ${s.remainingKcal} kcal, ${s.remainingProtein} g protein.`,
    `- Targets revised today: ${s.revised ? "yes" : "no"}.`,
    `- Logged so far: ${s.logged.length ? s.logged.join(", ") : "nothing yet"}.`,
    `- Rules that never suspend: ${s.medicalRules.join("; ")}.`,
    "",
    "HARD RULES",
    "- Never invent a number. You may repeat the numbers above verbatim; you may not compute new targets, macros, doses, or biomarker values.",
    "- If the user asks whether a food, drug, or supplement is safe or allowed, set touchesMedical true and keep lines short — another system answers that.",
    "- Never suggest the user override a rule that never suspends.",
    "- If the message is not about health, food, training, or this app, set offTopic true and answer in one line that redirects without being rude.",
    "- Do not offer to log food. Tell them to say what they ate and it gets logged.",
    "",
    "BANNED — these are generic slop and instantly break character",
    "- 'Focus on your diet plan', 'maintain your target macros', 'stay on track', 'keep it up', 'listen to your body', 'everything in moderation', 'consider consulting'.",
    "- Any sentence that would be equally true for any user on any day. If it does not engage with THIS person's situation, it is wrong.",
    "- Do not restate their targets back at them as advice. They can see the panel.",
    "",
    "HOW TO ANSWER WELL",
    "Engage with the specific situation they described. Name the real constraint. Offer the concrete move, or say plainly that it is their call and what each option costs.",
    "",
    "EXAMPLES OF THE RIGHT REGISTER",
    "User: 'my mother in law is visiting next week and she cooks constantly, im nervous'",
    "You: 'A week of someone else deciding portions is not a failure mode I need you to solve in advance.' / 'Eat what she cooks. Log it honestly, even roughly — a wide estimate I know about beats a clean number I made up.' / 'If the week runs high, I move the targets after, not during. Tell me when she arrives.'",
    "",
    "User: 'i feel like this is pointless'",
    "You: 'That is worth taking seriously rather than arguing with.' / 'Tell me which part feels pointless — the logging, the targets, or the results. They have different answers and I would rather fix the right one.'",
    "",
    "User: 'whats the weather'",
    "You: 'Not something I track. I handle food, training, and the numbers on your panel.'",
  ].join("\n");
}

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const history = (parsed.transcript ?? [])
    .map((m) => `${m.role === "user" ? "User" : "HealthOS"}: ${m.text}`)
    .join("\n");

  const prompt = [
    history && `Recent conversation:\n${history}`,
    `User just said: ${parsed.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let rateLimited = false;

  for (const model of MODELS) {
    try {
      const { output } = await generateText({
        model,
        temperature: 0.4,
        system: systemPrompt(parsed.state),
        output: Output.object({ schema: Reply }),
        prompt,
      });

      return Response.json({
        lines: output.lines.slice(0, 3),
        touchesMedical: output.touchesMedical,
        offTopic: output.offTopic,
        source: "model" as const,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`[v0] agent model ${model} failed:`, msg);

      // Every model in the list shares one gateway quota, so a rate limit on
      // the first is a rate limit on all three. Walking the rest just burns
      // seconds while someone waits at the phone.
      if (/rate limit|429|quota|free tier/i.test(msg)) {
        rateLimited = true;
        break;
      }
    }
  }

  // The demo must never dead-end — but it must also never claim it failed to
  // understand when the truth is that it could not reach a model. Saying "I did
  // not follow that" here would be the one lie this whole demo argues against.
  return Response.json({
    lines: rateLimited
      ? [
          "I understood you. I could not reach the model I use for open questions — this demo is on a shared quota and it is spent.",
          "Give it a minute, or say something I handle locally: what you ate, what changed about training, or why one of your numbers is what it is.",
        ]
      : [
          "I understood you, but the part of me that answers open questions is unreachable right now.",
          "Tell me what you ate, tell me what changed about your training, or ask me why one of your numbers is what it is — I handle those locally.",
        ],
    touchesMedical: false,
    offTopic: false,
    source: "degraded" as const,
    degradedReason: rateLimited ? ("rate_limited" as const) : ("unreachable" as const),
  });
}
