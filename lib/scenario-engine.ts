// Pure glue: turns (beats, choices-made-so-far) into a flat timeline, and a
// flat timeline into the DemoEvent log the reducer consumes. No planning
// logic — just sequencing the fixture the author already wrote.

import type { DemoEvent } from "./events";
import type { Beat, ScenarioContext } from "./fixtures/scenarios/types";

export function buildTimeline(beats: Beat[], ctx: ScenarioContext): Beat[] {
  const out: Beat[] = [];
  for (const beat of beats) {
    out.push(beat);
    if (beat.kind === "choice") {
      const chosenId = ctx[beat.id];
      if (!chosenId) break;
      const option = beat.options.find((o) => o.id === chosenId);
      if (!option) break;
      out.push(...buildTimeline(option.branch(ctx), ctx));
    }
  }
  return out;
}

export type SourcedEvent = { event: DemoEvent; beatId: string };

function eventsOf(beat: Beat): DemoEvent[] {
  return "events" in beat && beat.events ? beat.events : [];
}

export function buildEventLog(
  seedEvents: DemoEvent[],
  revealedBeats: Beat[],
): { events: DemoEvent[]; sourced: SourcedEvent[] } {
  const events: DemoEvent[] = [];
  const sourced: SourcedEvent[] = [];
  let lastFoodLoggedIndex = -1;

  for (const event of seedEvents) {
    events.push(event);
    if (event.t === "FOOD_LOGGED") lastFoodLoggedIndex = events.length - 1;
    sourced.push({ event, beatId: "__seed__" });
  }

  for (const beat of revealedBeats) {
    for (const raw of eventsOf(beat)) {
      let event = raw;
      if (event.t === "TARGETS_REVISED" && event.causeEventIdx === -1) {
        event = { ...event, causeEventIdx: lastFoodLoggedIndex };
      }
      events.push(event);
      if (event.t === "FOOD_LOGGED") lastFoodLoggedIndex = events.length - 1;
      sourced.push({ event, beatId: beat.id });
    }
  }

  return { events, sourced };
}
