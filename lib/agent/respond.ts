/**
 * Turns a classified intent plus a server-derived snapshot into a reply.
 *
 * The demo's version of this file was deleted with good reason: it read from
 * `lib/fixtures/*` and narrated a script, so every number it said was invented.
 * This one may only cite `AgentSnapshot`, and when the snapshot has no figure it
 * says so instead of reaching for a plausible one.
 *
 * Two rules run through every branch:
 *
 *  1. A target and a floor are different claims (`DayTarget.proteinKind`).
 *     Clearing a 150g floor is a success; missing a 205g target is not. Quoting
 *     one as the other is §4.11 — an assumption in a measurement's clothes.
 *  2. Medical questions are refused and surfaced, never answered (DNA
 *     principle 12). This module holds no drug-interaction knowledge and must
 *     not appear to.
 */

import type { Intent } from "./nlu";
import type { AgentSnapshot } from "./snapshot";

export type Reply = {
  text: string;
  /** "local" — derived here. "degraded" — we had to admit we lack the data. */
  source: "local" | "degraded";
  /** True when the caller should hand off to the model instead of using this. */
  handoff?: boolean;
};

function round(n: number): number {
  return Math.round(n);
}

/** "148g of your 150g floor" vs "148g of your 205g target" — never interchangeable. */
function proteinProgress(snap: AgentSnapshot): string | null {
  const target = snap.proposal?.dayTarget;
  if (!target?.proteinG) return null;
  const kind = target.proteinKind === "FLOOR" ? "floor" : "target";
  const done = round(snap.logged.proteinG);
  const left = Math.max(0, round(target.proteinG - snap.logged.proteinG));
  const hedge = snap.logged.anyEstimated ? " (estimated)" : "";
  return left > 0
    ? `${done}g${hedge} against your ${round(target.proteinG)}g ${kind} — ${left}g to go.`
    : `${done}g${hedge}, which clears your ${round(target.proteinG)}g ${kind}.`;
}

/**
 * The sentence to use when the planner has nothing. Each branch names the actual
 * blocker instead of a generic apology, because the fix differs per case.
 */
function explainUnavailable(snap: AgentSnapshot): string {
  switch (snap.unavailable) {
    case "NO_WHOOP_APP":
      return "I cannot see your recovery — this deployment has no WHOOP credentials, so there is no plan to speak of yet.";
    case "NOT_CONNECTED":
      return "WHOOP is not connected yet, so I have no sleep or recovery to build today's plan from. Connect it and I will have something real to say.";
    case "NO_GOAL":
      return "You have not set a goal yet, so I have nothing to plan against. Finish onboarding and I can work from your actual targets.";
    case "WHOOP_ERROR":
      return "WHOOP is not answering right now. I would rather tell you that than invent today's numbers.";
    default:
      return "I do not have today's plan in front of me.";
  }
}

export function respond(intent: Intent, snap: AgentSnapshot): Reply {
  /* ---- Medical: refuse, surface, defer. Always first. ---- */
  if (intent.kind === "medical_check") {
    const dish = intent.food?.label;
    const flagged = intent.food?.trips;
    const notes = snap.medicalNotes?.trim();

    // Deliberately does not answer. We hold no interaction table, and deriving
    // one from free-text notes would be fabrication in an authoritative voice.
    const opening = flagged
      ? `${dish ?? "That"} is one I will not clear on my own — it is known to interact with some medications.`
      : `That is a medical question, and I am not the right thing to answer it.`;

    const yours = notes
      ? ` You told me at onboarding: "${notes}". I am repeating that back rather than interpreting it.`
      : ` I do not have your medications on file, so I cannot even check.`;

    return {
      source: "local",
      text: `${opening}${yours} Please put it to your doctor or pharmacist — I can log it once you have decided, but I will not be the one who decides.`,
    };
  }

  if (intent.kind === "ask_remaining") {
    if (!snap.proposal) {
      return { source: "degraded", text: explainUnavailable(snap) };
    }
    const protein = proteinProgress(snap);
    const kcalTarget = snap.proposal.dayTarget.kcal;
    const parts: string[] = [];

    if (snap.logged.count === 0) {
      parts.push("Nothing logged yet today.");
    }
    if (protein) parts.push(protein);
    else parts.push("I am not holding a protein figure for today — the planner deferred it rather than guess.");

    if (kcalTarget) {
      parts.push(
        `Energy: ${round(snap.logged.kcal)} of ${round(kcalTarget)} kcal${snap.logged.anyEstimated ? ", part estimated" : ""}.`,
      );
    }
    if (snap.fromCache) {
      parts.push("These come from your last stored day — WHOOP was unreachable, so treat them as stale.");
    }
    return { source: "local", text: parts.join(" ") };
  }

  if (intent.kind === "ask_what_to_eat") {
    if (!snap.proposal) return { source: "degraded", text: explainUnavailable(snap) };

    const next = snap.proposal.slots.find((s) => s.oneDecision) ?? snap.proposal.slots[0];
    if (!next) {
      return {
        source: "degraded",
        text: "Today's plan has no slots in it, so I have nothing concrete to point you at.",
      };
    }
    const decision = next.oneDecision
      ? ` The one thing that matters here: ${next.oneDecision}`
      : "";
    const macro = next.targetProteinG
      ? ` Aim for about ${round(next.targetProteinG)}g protein.`
      : " I am not putting a gram figure on it — you told me your control over food today is limited, and precision you cannot act on is theater.";
    return {
      source: "local",
      text: `${next.label} at ${next.slotTime} — ${next.purpose}.${macro}${decision}`,
    };
  }

  if (intent.kind === "ask_why") {
    if (!snap.proposal) return { source: "degraded", text: explainUnavailable(snap) };
    const why = snap.proposal.rationale;
    if (why.length === 0) {
      return {
        source: "degraded",
        text: "The planner did not record a rationale for today, so I will not reverse-engineer one.",
      };
    }
    const deferred = snap.proposal.deferrals.length
      ? ` It deliberately did not decide: ${snap.proposal.deferrals.join("; ")}.`
      : "";
    return { source: "local", text: `${why.map((r) => `• ${r}`).join("\n")}${deferred}` };
  }

  /* Everything else — the emotional long tail, open-ended talk — is exactly what
   * a model is better at, so it hands off rather than replying from a template. */
  return { source: "local", handoff: true, text: "" };
}
