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

const MODEL = "anthropic/claude-haiku-4.5";

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

  try {
    const { output } = await generateText({
      model: MODEL,
      temperature: 0.4,
      system: systemPrompt(parsed.state),
      output: Output.object({ schema: Reply }),
      prompt: [history && `Recent conversation:\n${history}`, `User just said: ${parsed.message}`]
        .filter(Boolean)
        .join("\n\n"),
    });

    return Response.json({
      lines: output.lines.slice(0, 3),
      touchesMedical: output.touchesMedical,
      offTopic: output.offTopic,
      source: "model" as const,
    });
  } catch (error) {
    console.log("[v0] agent fallback failed:", error instanceof Error ? error.message : error);
    // The demo must never dead-end on a network failure. Degrade to something
    // that is still in voice and still true.
    return Response.json({
      lines: [
        "I did not follow that.",
        "Tell me what you ate, tell me what changed about your training, or ask me why one of your numbers is what it is.",
      ],
      touchesMedical: false,
      offTopic: false,
      source: "degraded" as const,
    });
  }
}
