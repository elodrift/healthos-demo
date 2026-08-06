// Pure glue: turns (script, choices-made-so-far) into a flat timeline, and a
// flat timeline into the append-only DemoEvent log the reducer consumes.

import type { DemoEvent } from "./events";
import { buildScript, seedEvents } from "./fixtures/day-script";
import type { Beat, ScriptContext } from "./fixtures/script-types";

export function buildTimeline(ctx: ScriptContext): Beat[] {
  const walk = (beats: Beat[]): Beat[] => {
    const out: Beat[] = [];
    for (const beat of beats) {
      out.push(beat);
      if (beat.kind === "choice") {
        const chosenId = ctx.choices[beat.id];
        if (!chosenId) break;
        const option = beat.options.find((o) => o.id === chosenId);
        if (!option) break;
        out.push(...walk(option.branch(ctx)));
      }
    }
    return out;
  };
  return walk(buildScript());
}

export type SourcedEvent = { event: DemoEvent; beatId: string; at: string; index: number };

export function buildEventLog(
  ctx: ScriptContext,
  revealedBeats: Beat[],
): { events: DemoEvent[]; sourced: SourcedEvent[] } {
  const events: DemoEvent[] = [];
  const sourced: SourcedEvent[] = [];
  let lastCauseIdx = -1;

  const push = (event: DemoEvent, beatId: string, at: string) => {
    let e = event;
    if (e.t === "TARGETS_REVISED" && e.causeEventIdx === -1) {
      e = { ...e, causeEventIdx: lastCauseIdx };
    }
    events.push(e);
    sourced.push({ event: e, beatId, at, index: events.length - 1 });
    if (e.t === "TRAINING_CHANGED" || e.t === "FOOD_LOGGED") {
      lastCauseIdx = events.length - 1;
    }
  };

  for (const seed of seedEvents(ctx.setup)) {
    push(seed.event, "__seed__", seed.at);
  }

  for (const beat of revealedBeats) {
    for (const raw of beat.events ?? []) {
      push(raw, beat.id, beat.time);
    }
  }

  return { events, sourced };
}
