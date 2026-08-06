"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { SourcedEvent } from "@/lib/scenario-engine";
import { reasonFor } from "@/lib/fixtures/copy";
import type { DemoEvent } from "@/lib/events";

const TYPE_LABEL: Record<DemoEvent["t"], string> = {
  SESSION_OPENED: "Session opened",
  FOOD_LOGGED: "Food logged",
  TRAINING_CHANGED: "Training changed",
  TARGETS_REVISED: "Targets revised",
  DAY_CLOSED: "Day closed",
};

export function EngineFeed({
  sourced,
  highlightedBeatId,
  onHover,
}: {
  sourced: SourcedEvent[];
  highlightedBeatId: string | null;
  onHover: (beatId: string | null) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-3">
      <div className="mb-2 px-1 text-[10px] font-medium uppercase tracking-widest text-ink-lo">
        The engine — event log, reasons attached
      </div>
      <AnimatePresence initial={false}>
        {sourced.map((s, i) => {
          const isHighlighted = s.beatId !== "__seed__" && s.beatId === highlightedBeatId;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              onMouseEnter={() => onHover(s.beatId)}
              onMouseLeave={() => onHover(null)}
              className={`mb-2 rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                isHighlighted ? "border-accent-green/70 bg-accent-green/5" : "border-base-700 bg-base-850/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-lo">
                  {TYPE_LABEL[s.event.t]}
                </span>
                {s.event.t === "FOOD_LOGGED" && (
                  <span className="rounded-full bg-base-700 px-2 py-0.5 text-[10px] font-semibold text-ink-mid">
                    {s.event.confidence}
                  </span>
                )}
              </div>
              <p className="mt-1 leading-relaxed text-ink-mid">{reasonFor(s.event)}</p>
              {s.event.t === "FOOD_LOGGED" && (
                <p className="mt-1 tabular-nums text-ink-lo">
                  {s.event.macros.protein_g}g protein · {s.event.macros.kcal} kcal
                  {s.event.macros.kcal_range
                    ? ` (range ${s.event.macros.kcal_range[0]}–${s.event.macros.kcal_range[1]})`
                    : ""}
                </p>
              )}
              {s.event.t === "TARGETS_REVISED" && (
                <p className="mt-1 tabular-nums text-ink-lo">
                  → {s.event.targets.protein_g}g protein / {s.event.targets.kcal} kcal
                </p>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {sourced.length === 0 && (
        <p className="px-2 py-4 text-xs text-ink-lo">
          No events yet — the log fills in as the conversation plays.
        </p>
      )}
    </div>
  );
}
