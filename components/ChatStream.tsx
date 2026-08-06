"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePlayerStore } from "@/lib/store";
import { useDemoState } from "@/lib/useDemoState";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChipBar } from "./ChipBar";
import { CardRenderer } from "./cards/CardRenderer";

export function ChatStream() {
  const { revealedBeats, pendingChoice, isDone } = useDemoState();
  const typing = usePlayerStore((s) => s.typing);
  const dimming = usePlayerStore((s) => s.dimming);
  const highlightBeatId = usePlayerStore((s) => s.highlightBeatId);
  const setHighlight = usePlayerStore((s) => s.setHighlight);
  const choose = usePlayerStore((s) => s.choose);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [revealedBeats.length, typing, pendingChoice]);

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

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {revealedBeats.map((beat) => {
          const highlighted = highlightBeatId === beat.id;
          const onHover = (h: boolean) => setHighlight(h ? beat.id : null);

          if (beat.kind === "message") {
            return (
              <MessageBubble
                key={beat.id}
                speaker={beat.speaker}
                text={beat.text}
                time={beat.time}
                highlighted={highlighted}
                onHover={onHover}
              />
            );
          }
          if (beat.kind === "card") {
            return (
              <CardRenderer
                key={beat.id}
                card={beat.card}
                highlighted={highlighted}
                onHover={onHover}
              />
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
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-lo">
              22:00 · day closed
            </span>
          </motion.div>
        ) : null}

        <div ref={endRef} />
      </div>

      {pendingChoice ? (
        <ChipBar
          options={pendingChoice.options.map((o) => ({ id: o.id, label: o.label }))}
          onSelect={(optionId) => choose(pendingChoice.id, optionId)}
        />
      ) : null}
    </div>
  );
}
