"use client";

import { create } from "zustand";
import { buildEventLog, buildTimeline } from "./script-engine";
import { reduce } from "./reducer";
import {
  defaultPersonaId,
  personaById,
  type GoalMode,
  type PersonaId,
} from "./fixtures/personas";
import type { Beat, ScriptContext } from "./fixtures/script-types";
import { dayClock } from "./fixtures/day-script";
import { classify, HANDOFF_THRESHOLD } from "./agent/nlu";
import {
  feedLogBeats,
  planJoinBeats,
  respond,
  userBeat,
  type AgentSnapshot,
} from "./agent/respond";
import { authorById, checkIns, dishById, placeById } from "./fixtures/community";

export type Phase = "setup" | "day";
export type Tab = "channel" | "engine";
/** Surfaces inside the phone itself. The community feed is a screen in the
 *  product, not a third pane of the demo. */
export type PhoneScreen = "today" | "community";

const TYPING_MS = 850;
const USER_ECHO_MS = 240;
const CARD_MS = 620;
const DIM_MS = 750;
const AUTO_CHOICE_MS = 14000;
/** gap between successive agent beats in a free-typed reply */
const LIVE_BEAT_MS = 620;

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
  phoneScreen: PhoneScreen;
  /** dishes logged from the feed this session, so the UI can show the effect */
  feedLogged: string[];
  /**
   * Planned check-ins the user has joined. Kept separate from feedLogged
   * because a plan is explicitly not a log — conflating them is exactly the
   * false-precision mistake the product refuses.
   */
  joinedPlans: string[];
  /**
   * Which proposal the user actually chose, keyed by the beat that offered it.
   *
   * The agent's whole posture is "I am not moving anything until you pick"
   * (DNA §4.12, system proposes / user disposes) — but until now the proposals
   * card was a read-only list, so there was nothing to pick with. The promise
   * was made and then not honoured. This is the disposal half.
   */
  chosenProposals: Record<string, number>;
  /** cross-highlight: the beat currently linked across chat <-> engine */
  highlightBeatId: string | null;
  timer: ReturnType<typeof setTimeout> | null;

  /**
   * Free-typed turns and the agent's answers, appended after the scripted
   * timeline. These carry real DemoEvents, so a typed meal moves the macro
   * header and lands in the engine feed exactly like a scripted one.
   */
  liveBeats: Beat[];
  /** the scripted day holds still while someone is having their own conversation */
  paused: boolean;
  /** true while the fallback model is being consulted */
  thinking: boolean;
  /** set when the last reply came from the model rather than the matcher */
  lastReplySource: "matcher" | "model" | "guardrail" | null;

  ctx: () => ScriptContext;
  setPersona: (id: PersonaId) => void;
  setMode: (m: GoalMode) => void;
  setSetupStep: (n: number) => void;
  startDay: () => void;
  choose: (beatId: string, optionId: string) => void;
  setActiveTab: (t: Tab) => void;
  setPhoneScreen: (s: PhoneScreen) => void;
  /** "I ate this too" — logs the community median as a real event */
  logFromFeed: (dishId: string) => Promise<void>;
  /** joining a friend's planned check-in — records a plan, logs nothing */
  joinPlan: (checkInId: string) => Promise<void>;
  /** committing to one of the agent's proposals — the "user disposes" half */
  chooseProposal: (beatId: string, index: number) => void;
  setHighlight: (id: string | null) => void;
  sendMessage: (text: string) => Promise<void>;
  resume: () => void;
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
    if (state.phase !== "day" || state.paused) return;
    const timeline = buildTimeline(state.ctx());
    if (state.revealCount >= timeline.length) return;

    const next = timeline[state.revealCount];

    const reveal = () => {
      set((s) => ({ revealCount: s.revealCount + 1, typing: false, dimming: false, timer: null }));
      schedule();
    };

    // A pending choice renders as chips, waits for the visitor, then auto-plays
    // the first option so the day never stalls.
    if (next.kind === "choice") {
      set((s) => ({ revealCount: s.revealCount + 1, typing: false, dimming: false }));
      const t = setTimeout(() => {
        set({ timer: null });
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

  /**
   * The state the agent reasons against — derived the same way the UI derives
   * it, by replaying the event log through the reducer. The agent has no
   * private copy of the truth.
   */
  function snapshot(): AgentSnapshot {
    const s = get();
    const ctx = s.ctx();
    const timeline = buildTimeline(ctx);
    const revealed = timeline.slice(0, s.revealCount);
    const all = [...revealed, ...s.liveBeats];
    const { events } = buildEventLog(ctx, all);
    const state = reduce(events);
    const persona = personaById(s.personaId);
    const last = all[all.length - 1];

    return {
      time: last?.time ?? dayClock[0],
      name: persona.displayName,
      targets: state.targets,
      targetsVersion: state.targetsVersion,
      consumed: state.consumed,
      remaining: state.remaining,
      medicalRules: persona.medicalNeverSuspends,
      alreadyRevised: state.revisions.length > 0,
      loggedLabels: state.loggedMeals.map((m) => m.event.label),
    };
  }

  /** Reveal an agent reply beat by beat, with a typing pause before each line. */
  function drip(beats: Beat[]): Promise<void> {
    return new Promise((resolve) => {
      const step = (i: number) => {
        if (i >= beats.length) {
          set({ typing: false });
          resolve();
          return;
        }
        const beat = beats[i];
        set({ typing: beat.kind === "message" });
        setTimeout(() => {
          set((s) => ({ liveBeats: [...s.liveBeats, beat], typing: false }));
          setTimeout(() => step(i + 1), 120);
        }, LIVE_BEAT_MS);
      };
      step(0);
    });
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
    phoneScreen: "today",
    feedLogged: [],
    joinedPlans: [],
    chosenProposals: {},
    highlightBeatId: null,
    timer: null,

    liveBeats: [],
    paused: false,
    thinking: false,
    lastReplySource: null,

    ctx: () => ({
      setup: { personaId: get().personaId, mode: get().mode },
      choices: get().choices,
    }),

    setPersona: (id) => set({ personaId: id }),
    setMode: (m) => set({ mode: m }),
    setSetupStep: (n) => set({ setupStep: n }),

    startDay: () => {
      if (get().phase === "day") return;
      set({ phase: "day", revealCount: 0, choices: {}, liveBeats: [], paused: false });
      schedule();
    },

    choose: (beatId, optionId) => {
      clear();
      const nextChoices = { ...get().choices, [beatId]: optionId };
      // Answering splices the chosen branch in after this beat. Re-derive the
      // timeline and park revealCount just past the choice so the day resumes
      // on the first beat of the branch instead of re-revealing the chips.
      const timeline = buildTimeline({
        setup: { personaId: get().personaId, mode: get().mode },
        choices: nextChoices,
      });
      const idx = timeline.findIndex((b) => b.id === beatId);
      set({
        choices: nextChoices,
        highlightBeatId: null,
        // Answering a chip is an explicit "carry on" — it lifts a typing pause.
        paused: false,
        revealCount: idx >= 0 ? idx + 1 : get().revealCount,
      });
      schedule();
    },

    setActiveTab: (t) => set({ activeTab: t }),
    setPhoneScreen: (screen) => set({ phoneScreen: screen }),

    /**
     * Tapping "I ate this too" is a real log, not a like. It emits a
     * FOOD_LOGGED event carrying the community median and — crucially — the
     * community's range, so the macro header moves and the engine feed shows
     * where the number came from.
     *
     * The cause string names the sample size, because "412 logs" is the actual
     * reason this estimate is tighter than a solo guess would have been.
     */
    logFromFeed: async (dishId) => {
      if (get().thinking) return;
      const dish = dishById(dishId);

      clear();
      const s = snapshot();
      const t = s.time;

      set((st) => ({
        paused: true,
        phoneScreen: "today",
        activeTab: "channel",
        feedLogged: st.feedLogged.includes(dishId) ? st.feedLogged : [...st.feedLogged, dishId],
        liveBeats: [...st.liveBeats, userBeat(`I ate this too — ${dish.name.toLowerCase()}`, t)],
        highlightBeatId: null,
        lastReplySource: "matcher",
      }));

      await drip(feedLogBeats(dish, s));
    },

    /**
     * Joining a friend's planned check-in from the map.
     *
     * Note what this does NOT do: no FOOD_LOGGED event, no feedLogged entry, no
     * movement in the macro header. Nothing has been eaten — the meal is
     * tomorrow. It records the plan and hands back a proposal, which is DNA
     * §4.12 (system proposes, user disposes) applied to a future meal rather
     * than a past one.
     */
    joinPlan: async (checkInId) => {
      if (get().thinking) return;
      const checkIn = checkIns.find((c) => c.id === checkInId);
      if (!checkIn || checkIn.status !== "planned") return;

      const dish = dishById(checkIn.dishId);
      const place = placeById(checkIn.placeId);
      const friend = authorById(checkIn.authorId);

      clear();
      const s = snapshot();
      const t = s.time;

      set((st) => ({
        paused: true,
        phoneScreen: "today",
        activeTab: "channel",
        joinedPlans: st.joinedPlans.includes(checkInId)
          ? st.joinedPlans
          : [...st.joinedPlans, checkInId],
        liveBeats: [
          ...st.liveBeats,
          userBeat(`Joining ${friend.name} — ${dish.name.toLowerCase()}, ${checkIn.time}`, t),
        ],
        highlightBeatId: null,
        lastReplySource: "matcher",
      }));

      await drip(planJoinBeats(dish, place.name, checkIn.time, friend.name, s));
    },

    /**
     * Commit to one proposal.
     *
     * Deliberately emits no DemoEvent and moves no macro: choosing "hold room
     * for dinner" is a decision about intent, not a claim that food was eaten.
     * The receipt in the card is the whole point — the user gets told what they
     * committed to, and it is the one thing on screen that is theirs.
     */
    chooseProposal: (beatId, index) =>
      set((st) => ({
        chosenProposals: { ...st.chosenProposals, [beatId]: index },
      })),

    setHighlight: (id) => set({ highlightBeatId: id }),

    sendMessage: async (raw) => {
      const text = raw.trim();
      if (!text || get().thinking) return;

      // The scripted day stops dead. Nothing is more disorienting than the
      // narrative talking over you while you are mid-conversation.
      clear();
      const at = snapshot().time;
      set((s) => ({
        paused: true,
        liveBeats: [...s.liveBeats, userBeat(text, at)],
        highlightBeatId: null,
      }));

      const intent = classify(text);

      if (intent.score >= HANDOFF_THRESHOLD) {
        set({ lastReplySource: "matcher" });
        await drip(respond(intent, snapshot()));
        return;
      }

      // Below the threshold this is genuinely open-ended, so the model gets a
      // turn. It never gets to touch a target or a rule.
      set({ typing: true, thinking: true });
      try {
        const s = snapshot();
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: text,
            state: {
              time: s.time,
              name: s.name,
              mode: get().mode,
              targets: {
                kcal: s.targets.kcal,
                protein_g: s.targets.protein_g,
                carbs_g: s.targets.carbs_g,
                fat_max_g: s.targets.fat_max_g,
              },
              consumedKcal: Math.round(s.consumed.kcal),
              remainingKcal: Math.round(s.remaining.kcal),
              remainingProtein: Math.round(s.remaining.protein_g),
              medicalRules: s.medicalRules.map((r) => r.label),
              revised: s.alreadyRevised,
              logged: s.loggedLabels,
            },
            transcript: get()
              .liveBeats.filter((b) => b.kind === "message")
              .slice(-8)
              .map((b) => ({
                role: b.kind === "message" && b.speaker === "user" ? "user" : "agent",
                text: b.kind === "message" ? b.text : "",
              })),
          }),
        });

        const data: {
          lines?: string[];
          touchesMedical?: boolean;
          source?: "model" | "degraded";
        } = await res.json();
        set({ typing: false, thinking: false });

        // THE GUARDRAIL. If the model thinks the honest answer requires ruling
        // on safety, its text is discarded unread and the deterministic branch
        // answers instead. A model never gets the last word on a medical rule.
        if (data.touchesMedical) {
          set({ lastReplySource: "guardrail" });
          await drip(respond({ ...classify(text), kind: "medical_check", score: 1 }, snapshot()));
          return;
        }

        // A degraded reply is not a model reply — do not badge it as one.
        set({ lastReplySource: data.source === "degraded" ? "guardrail" : "model" });
        await drip(
          (data.lines ?? []).map((line) => ({
            kind: "message" as const,
            speaker: "healthos" as const,
            text: line,
            time: s.time,
            id: `live-model-${Math.random().toString(36).slice(2, 9)}`,
          })),
        );
      } catch {
        // The request itself never landed — offline, or the route is down. Say
        // that, rather than pretending not to have understood.
        const s = snapshot();
        set({ typing: false, thinking: false, lastReplySource: "guardrail" });
        await drip([
          {
            kind: "message",
            speaker: "healthos",
            text: "I understood you, but I cannot reach the model I use for open questions.",
            time: s.time,
            id: `live-offline-a-${Math.random().toString(36).slice(2, 9)}`,
          },
          {
            kind: "message",
            speaker: "healthos",
            text: "Tell me what you ate, what changed about your training, or ask why one of your numbers is what it is — I handle those locally.",
            time: s.time,
            id: `live-offline-b-${Math.random().toString(36).slice(2, 9)}`,
          },
        ]);
      }
    },

    resume: () => {
      set({ paused: false, typing: false });
      schedule();
    },

    scrubToIndex: (index) => {
      clear();
      // Jumping the clock invalidates anything typed at the old time.
      set({
        revealCount: Math.max(1, index),
        typing: false,
        dimming: false,
        liveBeats: [],
        paused: false,
        lastReplySource: null,
      });
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
        liveBeats: [],
        paused: false,
        lastReplySource: null,
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
        liveBeats: [],
        paused: false,
        thinking: false,
        lastReplySource: null,
        // These three were being left behind on reset, so a restarted demo
        // opened with the previous visitor's community logs still counted and
        // sometimes on the wrong phone screen.
        phoneScreen: "today",
        feedLogged: [],
        joinedPlans: [],
        chosenProposals: {},
      });
    },
  };
});
