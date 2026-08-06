"use client";

import { useMemo } from "react";
import { usePlayerStore } from "./store";
import { beats, seedEvents } from "./fixtures/scenarios/boat-trip";
import { buildTimeline, buildEventLog } from "./scenario-engine";
import { reduce } from "./reducer";

export function useDemoState() {
  const ctx = usePlayerStore((s) => s.ctx);
  const revealCount = usePlayerStore((s) => s.revealCount);

  const timeline = useMemo(() => buildTimeline(beats, ctx), [ctx]);
  const revealedBeats = useMemo(() => timeline.slice(0, revealCount), [timeline, revealCount]);
  const { events, sourced } = useMemo(
    () => buildEventLog(seedEvents, revealedBeats),
    [revealedBeats],
  );
  const demoState = useMemo(() => reduce(events), [events]);

  const lastRevealed = revealedBeats[revealedBeats.length - 1];
  const pendingChoice =
    lastRevealed && lastRevealed.kind === "choice" && !ctx[lastRevealed.id] ? lastRevealed : null;

  const isDone = revealCount >= timeline.length && !pendingChoice;

  return { timeline, revealedBeats, events, sourced, demoState, pendingChoice, isDone };
}
