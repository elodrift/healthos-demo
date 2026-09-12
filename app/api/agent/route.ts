/**
 * The chat endpoint.
 *
 * Rebuilt from the version deleted at commit 1363a76, with the four reasons it
 * was deleted addressed rather than reintroduced:
 *
 *  1. **It had no auth.** An unauthenticated route calling a paid model is a
 *     quota drain on the same AI Gateway budget food recognition needs. A session
 *     is now required before any model is reached.
 *  2. **The client supplied the facts.** The old body carried `state` with the
 *     user's targets and intake, so a caller could POST invented numbers and have
 *     the agent confirm them in the product's authoritative voice. Facts now come
 *     only from `buildAgentSnapshot(session.user.id)`.
 *  3. **No ceiling.** Per-user rate limiting now applies.
 *  4. **It narrated fixtures.** The responder may only cite the snapshot.
 *
 * Division of labour: the deterministic matcher owns every intent with
 * consequences — medical, targets, logging — and the model is only reached for
 * open-ended talk. A probabilistic system must never be what decides whether
 * grapefruit is safe.
 */

import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { classify } from "@/lib/agent/nlu";
import { checkRateLimit } from "@/lib/agent/rate-limit";
import { tooManyRequests } from "@/lib/rate-limit";
import { respond } from "@/lib/agent/respond";
import { buildAgentSnapshot, type AgentSnapshot } from "@/lib/agent/snapshot";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivate } from "@/lib/http";
import { log } from "@/lib/log";
import { chatMessage } from "@/lib/db/schema";

// Removed for cacheComponents compatibility

/**
 * Same measured order as lib/food/recognize.ts: on this project's current
 * Gateway tier the gemini-3.x models return "Free tier users do not have access",
 * so the list leads with what actually answers today.
 */
const MODELS = ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "openai/gpt-4o-mini"] as const;

const Body = z.object({
  message: z.string().min(1).max(1000),
  /** IANA zone from the browser, so "today" is the user's day. */
  timeZone: z.string().min(1).max(60),
});

/**
 * What the model is allowed to know, rendered as text.
 *
 * Only snapshot-derived figures appear here. The model is explicitly told it may
 * not invent numbers or answer medical questions, because this prompt is reached
 * only for the open-ended tail — anything consequential was already handled
 * deterministically and never gets this far.
 */
function systemPrompt(snap: AgentSnapshot): string {
  const facts: string[] = [];

  if (snap.proposal) {
    const t = snap.proposal.dayTarget;
    facts.push(`Wake ${snap.proposal.wakeTime}, sleep ${snap.proposal.sleepTime}.`);
    if (t.proteinG) {
      facts.push(
        `Protein ${t.proteinKind === "FLOOR" ? "floor" : "target"}: ${Math.round(t.proteinG)}g. Logged so far: ${Math.round(snap.logged.proteinG)}g.`,
      );
    }
    if (t.kcal) facts.push(`Energy target ${Math.round(t.kcal)} kcal, logged ${Math.round(snap.logged.kcal)}.`);
    facts.push(`Control over food today: ${snap.proposal.controlLevel}.`);
  } else {
    facts.push("There is no plan for today; the planner could not build one.");
  }
  facts.push(`Meals logged today: ${snap.logged.count}.`);

  return [
    "You are HealthOS. You are dry, specific, and you never flatter the user.",
    "",
    "Hard rules:",
    "- Never invent a number. If a figure is not in FACTS below, say you do not have it.",
    "- Never answer a medical or drug-interaction question. Defer to a clinician.",
    "- Never say things like 'maintain your calorie and protein goals'. Empty coaching register is the thing this product exists to argue against.",
    "- Two or three sentences. No lists, no headings, no emoji.",
    "",
    "FACTS (the only figures you may cite):",
    ...facts.map((f) => `- ${f}`),
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const session = await await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return jsonPrivate({ error: "Not signed in." }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = checkRateLimit(userId);
  if (!limit.ok) {
    return tooManyRequests("Too many messages in a row. Give it a moment.", limit.retryAfter);
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return jsonPrivate({ error: "That message could not be read." }, { status: 400 });
  }

  const snapshot = await buildAgentSnapshot(userId, body.timeZone);
  const intent = classify(body.message);
  const local = respond(intent, snapshot);

  let text = local.text;
  let source: string = local.source;

  // Only the open-ended tail reaches a model.
  if (local.handoff) {
    const history = await db
      .select({ role: chatMessage.role, text: chatMessage.text })
      .from(chatMessage)
      .where(eq(chatMessage.userId, userId))
      .orderBy(asc(chatMessage.createdAt))
      .limit(10);

    const result = await tryModels(systemPrompt(snapshot), history, body.message);
    text = result.text;
    source = result.source;
  }

  await db.insert(chatMessage).values([
    { userId, role: "user", text: body.message, source: "user" },
    { userId, role: "agent", text, source },
  ]);

  return jsonPrivate({ text, source, intent: intent.kind });
}

/**
 * Walk the fallback chain. If every model fails we return a plain admission
 * rather than a cheerful placeholder — a chat surface that pretends to have
 * answered is worse than one that says the model is unreachable.
 */
async function tryModels(
  system: string,
  history: { role: string; text: string }[],
  message: string,
): Promise<{ text: string; source: string }> {
  for (const model of MODELS) {
    try {
      const { text } = await generateText({
        model,
        system,
        messages: [
          ...history.map((h) => ({
            role: h.role === "agent" ? ("assistant" as const) : ("user" as const),
            content: h.text,
          })),
          { role: "user" as const, content: message },
        ],
        maxOutputTokens: 300,
      });
      const trimmed = text.trim();
      if (trimmed) return { text: trimmed, source: "model" };
    } catch (error) {
      // Structured so a recurring model outage is queryable in the log drain
      // rather than a string nobody greps for. No user content is included.
      log.warn("agent.model_failed", { model }, error);
    }
  }
  return {
    text: "I cannot reach the model right now, so I am not going to guess at an answer. Your logged numbers above are still accurate.",
    source: "degraded",
  };
}
