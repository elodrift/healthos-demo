"use client";

import { useMemo } from "react";
import { usePlayerStore } from "./store";
import { buildEventLog, buildTimeline } from "./script-engine";
import { reduce } from "./reducer";
import { dayClock } from "./fixtures/day-script";
import type { ChoiceBeat } from "./fixtures/script-types";

export function useDemoState() {
  const personaId = usePlayerStore((s) => s.personaId);
  const mode = usePlayerStore((s) => s.mode);
  const choices = usePlayerStore((s) => s.choices);
  const revealCount = usePlayerStore((s) => s.revealCount);
  const liveBeats = usePlayerStore((s) => s.liveBeats);

  const ctx = useMemo(
    () => ({ setup: { personaId, mode }, choices }),
    [personaId, mode, choices],
  );

  const timeline = useMemo(() => buildTimeline(ctx), [ctx]);
  const scripted = useMemo(() => timeline.slice(0, revealCount), [timeline, revealCount]);

  // Free-typed turns are appended, not spliced: the scripted day is paused
  // while someone types, so "after everything revealed so far" is also
  // chronologically correct. Their events run through the same reducer, which
  // is why a typed meal moves the header and shows up in the engine panel.
  const revealedBeats = useMemo(() => [...scripted, ...liveBeats], [scripted, liveBeats]);

  const { events, sourced } = useMemo(
    () => buildEventLog(ctx, revealedBeats),
    [ctx, revealedBeats],
  );
  const demoState = useMemo(() => reduce(events), [events]);

  const last = revealedBeats[revealedBeats.length - 1];

  // A pending choice is a property of the scripted timeline, so it must be read
  // from the last *scripted* beat — otherwise typing while the chips are up
  // would hide them and strand the day with no way to advance.
  const lastScripted = scripted[scripted.length - 1];
  const pendingChoice: ChoiceBeat | null =
    lastScripted && lastScripted.kind === "choice" && !choices[lastScripted.id]
      ? lastScripted
      : null;

  const isDone = revealCount >= timeline.length && !pendingChoice;

  const currentTime = last?.time ?? dayClock[0];

  /** first timeline index for each clock stop, for the scrubber */
  const clockIndex = useMemo(() => {
    return dayClock.map((t) => {
      const i = timeline.findIndex((b) => b.time >= t);
      return i === -1 ? timeline.length : i;
    });
  }, [timeline]);

  return {
    timeline,
    revealedBeats,
    events,
    sourced,
    demoState,
    pendingChoice,
    isDone,
    currentTime,
    clockIndex,
  };
}
