"use client";

import { create } from "zustand";
import { beats } from "@/lib/fixtures/scenarios/boat-trip";
import { buildTimeline } from "@/lib/scenario-engine";
import type { ScenarioContext } from "@/lib/fixtures/scenarios/types";

export type Tab = "channel" | "engine";

const HEALTHOS_TYPING_MS = 750;
const CARD_STAGE_MS = 550;
const USER_ECHO_MS = 150;
const DIM_BEFORE_REVISION_MS = 260;

function delayFor(beatKind: string, speaker?: string): number {
  if (beatKind === "message") return speaker === "healthos" ? HEALTHOS_TYPING_MS : USER_ECHO_MS;
  if (beatKind === "choice") return 0;
  return CARD_STAGE_MS;
}

type PlayerState = {
  ctx: ScenarioContext;
  revealCount: number;
  typingBeatId: string | null;
  dimming: boolean;
  autoplay: boolean;
  activeTab: Tab;
  highlightedBeatId: string | null;
  started: boolean;
  timer: ReturnType<typeof setTimeout> | null;

  start: () => void;
  choose: (beatId: string, optionId: string) => void;
  setAutoplay: (v: boolean) => void;
  setActiveTab: (t: Tab) => void;
  setHighlight: (id: string | null) => void;
  scrubTo: (index: number) => void;
  skipTyping: () => void;
};

function clearTimer(get: () => PlayerState) {
  const t = get().timer;
  if (t) clearTimeout(t);
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function scheduleNext() {
    clearTimer(get);
    const { ctx, revealCount, autoplay } = get();
    if (!autoplay) return;
    const timeline = buildTimeline(beats, ctx);
    if (revealCount >= timeline.length) return;
    const nextBeat = timeline[revealCount];

    const runReveal = () => {
      set((s) => ({ revealCount: s.revealCount + 1, typingBeatId: null, dimming: false, timer: null }));
      scheduleNext();
    };

    if (nextBeat.kind === "message" && nextBeat.speaker === "healthos") {
      set({ typingBeatId: nextBeat.id });
    }

    if (nextBeat.kind === "target-revision-card") {
      set({ dimming: true });
      const t1 = setTimeout(() => {
        set({ dimming: false });
        const t2 = setTimeout(runReveal, CARD_STAGE_MS);
        set({ timer: t2 });
      }, DIM_BEFORE_REVISION_MS);
      set({ timer: t1 });
      return;
    }

    const delay = delayFor(nextBeat.kind, nextBeat.kind === "message" ? nextBeat.speaker : undefined);
    const t = setTimeout(runReveal, delay);
    set({ timer: t });
  }

  return {
    ctx: {},
    revealCount: 0,
    typingBeatId: null,
    dimming: false,
    autoplay: true,
    activeTab: "channel",
    highlightedBeatId: null,
    started: false,
    timer: null,

    start: () => {
      if (get().started) return;
      set({ started: true });
      scheduleNext();
    },

    choose: (beatId, optionId) => {
      set((s) => ({ ctx: { ...s.ctx, [beatId]: optionId } }));
      scheduleNext();
    },

    setAutoplay: (v) => {
      set({ autoplay: v });
      if (v) scheduleNext();
      else clearTimer(get);
    },

    setActiveTab: (t) => set({ activeTab: t }),
    setHighlight: (id) => set({ highlightedBeatId: id }),

    scrubTo: (index) => {
      clearTimer(get);
      set({ revealCount: Math.max(0, index), typingBeatId: null, dimming: false, autoplay: false });
    },

    skipTyping: () => {
      const { typingBeatId, dimming } = get();
      if (!typingBeatId && !dimming) return;
      clearTimer(get);
      set((s) => ({ revealCount: s.revealCount + 1, typingBeatId: null, dimming: false, timer: null }));
      scheduleNext();
    },
  };
});
