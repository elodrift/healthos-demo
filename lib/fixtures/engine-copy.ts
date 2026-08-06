// How each event renders in the Engine feed: name (mono), a short detail, and
// exactly one reason line. Cause is always shown — that is the trust moment.

import type { DemoEvent, DiagnosisCode } from "@/lib/events";

export type EngineEntry = {
  name: string;
  detail: string;
  reason: string;
  tone: "green" | "amber" | "red" | "neutral";
};

export function engineEntryFor(event: DemoEvent): EngineEntry {
  switch (event.t) {
    case "SESSION_OPENED":
      return {
        name: "SESSION_OPENED",
        detail: "targets v1 frozen",
        reason: `cause: ${event.cause}`,
        tone: "green",
      };
    case "FOOD_LOGGED":
      return {
        name: "FOOD_LOGGED",
        detail:
          event.confidence === "HIGH"
            ? "confidence HIGH (planned meal)"
            : `confidence ${event.confidence}`,
        reason: `${event.label} · ${event.cause}`,
        tone: event.confidence === "HIGH" ? "green" : "amber",
      };
    case "TRAINING_CHANGED":
      return {
        name: "TRAINING_CHANGED",
        detail: event.change,
        reason: `cause: ${event.cause}`,
        tone: "amber",
      };
    case "TARGETS_REVISED":
      return {
        name: "TARGETS_REVISED",
        detail: `v${event.version}`,
        reason: [`cause: ${event.reason}`, ...event.notes].join(" · "),
        tone: "amber",
      };
    case "VARIANCE_PLANNED":
      return {
        name: "VARIANCE_PLANNED",
        detail: event.label,
        reason: `cause: ${event.cause}`,
        tone: "neutral",
      };
    case "PROPOSAL_ACCEPTED":
      return {
        name: "PROPOSAL_ACCEPTED",
        detail: event.label,
        reason: `cause: ${event.cause}`,
        tone: "green",
      };
    case "DIAGNOSIS":
      return {
        name: "DIAGNOSIS",
        detail: event.code,
        reason: event.causeChain.join(" → "),
        tone: event.code === "over_by_revision" ? "amber" : "neutral",
      };
    case "DAY_CLOSED":
      return {
        name: "DAY_CLOSED",
        detail: "summary written",
        reason: event.cause,
        tone: "green",
      };
  }
}

export const diagnosisLabel: Record<DiagnosisCode, string> = {
  on_track: "on track",
  over_by_choice: "over — by choice",
  over_by_revision: "over — plan changed, not overeating",
  uncertain: "uncertain — estimate, not a score",
};
