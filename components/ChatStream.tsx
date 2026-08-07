"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePlayerStore } from "@/lib/store";
import { useDemoState } from "@/lib/useDemoState";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChipBar } from "./ChipBar";
import { CardRenderer } from "./cards/CardRenderer";
import { Composer } from "./Composer";

export function ChatStream() {
  const { revealedBeats, pendingChoice, isDone } = useDemoState();
  const typing = usePlayerStore((s) => s.typing);
  const dimming = usePlayerStore((s) => s.dimming);
  const highlightBeatId = usePlayerStore((s) => s.highlightBeatId);
  const setHighlight = usePlayerStore((s) => s.setHighlight);
  const choose = usePlayerStore((s) => s.choose);
  const paused = usePlayerStore((s) => s.paused);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const settle = (behavior: ScrollBehavior) => {
      // Chasing the bottom of the stream hides the TOP of any turn taller than
      // the column — which is exactly the revision card at the climax. When the
      // newest turn doesn't fit, align its top edge instead so the headline
      // ("TARGETS REVISED", the struck-through numbers) is what lands in view.
      const beats = box.querySelectorAll<HTMLElement>("[data-beat]");
      const newest = beats[beats.length - 1];

      if (newest && newest.offsetHeight > box.clientHeight - 24) {
        // rect-delta rather than offsetTop: the beat's offsetParent is the
        // positioned wrapper, not this scroll box, so offsetTop would be skewed.
        const top =
          box.scrollTop + newest.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
        box.scrollTo({ top, behavior });
        return;
      }
      box.scrollTo({ top: box.scrollHeight, behavior });
    };

    settle(reduce ? "auto" : "smooth");

    /*
     * A beat's entrance animation grows its height AFTER this effect runs, so
     * the scrollHeight measured above was short and the last line of a long
     * reply stayed clipped below the fold. Re-pin once the animation has
     * settled.
     *
     * Deliberately NOT a ResizeObserver: the callback would fire on the very
     * layout change that `scrollTo` itself provokes, so observer -> scroll ->
     * observer looped until React tore the tree down. A single bounded timeout
     * fixes the clipping without being able to feed itself.
     */
    const repin = window.setTimeout(() => settle("auto"), 420);
    return () => window.clearTimeout(repin);
    // pendingChoice is an object rebuilt each render, so depend on its id —
    // the object identity would re-run this effect on every single render.
  }, [revealedBeats.length, typing, pendingChoice?.id]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* the stage dims just before the revision lands */}
      <AnimatePresence>
        {dimming ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0 z-10 bg-base-950/80"
          />
        ) : null}
      </AnimatePresence>

      {/*
       * The day plays itself, so new turns must be announced rather than
       * silently painted. mt-auto keeps the conversation resting on the reply
       * chips instead of stranding it at the top of a tall empty column.
       */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation with HealthOS"
      >
        <div className="mt-auto flex flex-col gap-4">
          {revealedBeats.map((beat) => {
            const highlighted = highlightBeatId === beat.id;
            const onHover = (h: boolean) => setHighlight(h ? beat.id : null);

            if (beat.kind === "message") {
              return (
                <div key={beat.id} data-beat>
                  <MessageBubble
                    speaker={beat.speaker}
                    text={beat.text}
                    time={beat.time}
                    highlighted={highlighted}
                    onHover={onHover}
                  />
                </div>
              );
            }
            if (beat.kind === "card") {
              return (
                <div key={beat.id} data-beat>
                  <CardRenderer
                    card={beat.card}
                    beatId={beat.id}
                    highlighted={highlighted}
                    onHover={onHover}
                  />
                </div>
              );
            }
            return null; // choice beats become chips; close beats are handled below
          })}

          {typing ? <TypingIndicator /> : null}

          {isDone ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-1 py-2 text-center"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-lo">
                22:00 · day closed
              </span>
            </motion.div>
          ) : null}
        </div>
      </div>

      {/*
       * Once the user types their own message the day is paused, and the
       * scripted chip becomes a stale suggestion for a conversation they have
       * already left. Inside a 390px phone it was costing ~90px — over a third
       * of the reading area — so it yields to the live conversation. The
       * Composer still renders "RESUME THE DAY", which is the way back.
       */}
      {pendingChoice && !paused ? (
        <ChipBar
          options={pendingChoice.options.map((o) => ({ id: o.id, label: o.label }))}
          onSelect={(optionId) => choose(pendingChoice.id, optionId)}
        />
      ) : null}

      {/* the way off the rail — always available, even mid-choice */}
      <Composer />
    </div>
  );
}
