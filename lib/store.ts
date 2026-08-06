"use client";

import { create } from "zustand";
import { buildTimeline } from "./script-engine";
import { defaultPersonaId, type GoalMode, type PersonaId } from "./fixtures/personas";
import type { ScriptContext } from "./fixtures/script-types";

export type Phase = "setup" | "day";
export type Tab = "channel" | "engine";

const TYPING_MS = 850;
const USER_ECHO_MS = 240;
const CARD_MS = 620;
const DIM_MS = 750;
const AUTO_CHOICE_MS = 14000;

type PlayerState = {
  phase: Phase;
  setupStep: number;
  personaId: PersonaId;
  mode: GoalMode;

  choices: Record<string, string>;
  revealCount: number;
  typing: boolean;
  dimming: boolean;
  activeTab: Tab;
  /** cross-highlight: the beat currently linked across chat <-> engine */
  highlightBeatId: string | null;
  timer: ReturnType<typeof setTimeout> | null;

  ctx: () => ScriptContext;
  setPersona: (id: PersonaId) => void;
  setMode: (m: GoalMode) => void;
  setSetupStep: (n: number) => void;
  startDay: () => void;
  choose: (beatId: string, optionId: string) => void;
  setActiveTab: (t: Tab) => void;
  setHighlight: (id: string | null) => void;
  scrubToIndex: (index: number) => void;
  replayFromDisruption: () => void;
  resetAll: () => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => {
  function clear() {
    const t = get().timer;
    if (t) clearTimeout(t);
    set({ timer: null });
  }

  function schedule() {
    clear();
    const state = get();
    if (state.phase !== "day") return;
    const timeline = buildTimeline(state.ctx());
    if (state.revealCount >= timeline.length) return;

    const next = timeline[state.revealCount];

    const reveal = () => {
      set((s) => ({ revealCount: s.revealCount + 1, typing: false, dimming: false, timer: null }));
      schedule();
    };

    // A pending choice waits for the visitor, then auto-plays the first option.
    if (next.kind === "choice") {
      set({ typing: false, dimming: false });
      const t = setTimeout(() => {
        set((s) => ({ revealCount: s.revealCount + 1, timer: null }));
        get().choose(next.id, next.options[0].id);
      }, AUTO_CHOICE_MS);
      set({ timer: t });
      return;
    }

    // THE CLIMAX: the stage dims before the revision card lands.
    if (next.kind === "card" && next.card.type === "target-revision") {
      set({ dimming: true, typing: false });
      const t = setTimeout(reveal, DIM_MS);
      set({ timer: t });
      return;
    }

    if (next.kind === "message" && next.speaker === "healthos") {
      set({ typing: true });
      const t = setTimeout(reveal, TYPING_MS);
      set({ timer: t });
      return;
    }

    const delay =
      next.kind === "message" ? USER_ECHO_MS : next.kind === "close" ? 400 : CARD_MS;
    const t = setTimeout(reveal, delay);
    set({ timer: t });
  }

  return {
    phase: "setup",
    setupStep: 0,
    personaId: defaultPersonaId,
    mode: "strict",

    choices: {},
    revealCount: 0,
    typing: false,
    dimming: false,
    activeTab: "channel",
    highlightBeatId: null,
    timer: null,

    ctx: () => ({
      setup: { personaId: get().personaId, mode: get().mode },
      choices: get().choices,
    }),

    setPersona: (id) => set({ personaId: id }),
    setMode: (m) => set({ mode: m }),
    setSetupStep: (n) => set({ setupStep: n }),

    startDay: () => {
      if (get().phase === "day") return;
      set({ phase: "day", revealCount: 0, choices: {} });
      schedule();
    },

    choose: (beatId, optionId) => {
      clear();
      set((s) => ({
        choices: { ...s.choices, [beatId]: optionId },
        highlightBeatId: null,
      }));
      schedule();
    },

    setActiveTab: (t) => set({ activeTab: t }),
    setHighlight: (id) => set({ highlightBeatId: id }),

    scrubToIndex: (index) => {
      clear();
      set({ revealCount: Math.max(1, index), typing: false, dimming: false });
      schedule();
    },

    replayFromDisruption: () => {
      clear();
      const { choices, personaId, mode } = get();
      const next: Record<string, string> = { ...choices };
      next["b4-fork"] = next["b4-fork"] === "skip-training" ? "restaurant" : "skip-training";
      // drop everything decided inside the branch we are leaving
      Object.keys(next).forEach((k) => {
        if (k.startsWith("b4a") || k.startsWith("b4b") || k.startsWith("b5")) delete next[k];
      });
      const timeline = buildTimeline({ setup: { personaId, mode }, choices: next });
      const forkIdx = timeline.findIndex((b) => b.id === "b4-fork");
      set({
        choices: next,
        activeTab: "channel",
        revealCount: forkIdx + 1,
        typing: false,
        dimming: false,
      });
      schedule();
    },

    resetAll: () => {
      clear();
      set({
        phase: "setup",
        setupStep: 0,
        choices: {},
        revealCount: 0,
        typing: false,
        dimming: false,
        activeTab: "channel",
        highlightBeatId: null,
      });
    },
  };
});
