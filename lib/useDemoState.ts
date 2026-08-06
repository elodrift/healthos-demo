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

  const ctx = useMemo(
    () => ({ setup: { personaId, mode }, choices }),
    [personaId, mode, choices],
  );

  const timeline = useMemo(() => buildTimeline(ctx), [ctx]);
  const revealedBeats = useMemo(() => timeline.slice(0, revealCount), [timeline, revealCount]);
  const { events, sourced } = useMemo(
    () => buildEventLog(ctx, revealedBeats),
    [ctx, revealedBeats],
  );
  const demoState = useMemo(() => reduce(events), [events]);

  const last = revealedBeats[revealedBeats.length - 1];
  const pendingChoice: ChoiceBeat | null =
    last && last.kind === "choice" && !choices[last.id] ? last : null;

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
