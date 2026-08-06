"use client";

// Renders the append-only event array directly. Nothing is derived here beyond
// how each event prints — this is the trust moment.

import { AnimatePresence, motion } from "framer-motion";
import type { SourcedEvent } from "@/lib/script-engine";
import { engineEntryFor } from "@/lib/fixtures/engine-copy";

const toneStyles = {
  green: "border-accent-green/35 bg-accent-green/[0.06]",
  red: "border-accent-red/40 bg-accent-red/[0.06]",
  neutral: "border-base-700 bg-base-850/70",
} as const;

const toneText = {
  green: "text-accent-green",
  red: "text-accent-red",
  neutral: "text-ink-mid",
} as const;

export function EngineFeed({
  sourced,
  highlightBeatId,
  onHover,
}: {
  sourced: SourcedEvent[];
  highlightBeatId: string | null;
  onHover: (beatId: string | null) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between border-b border-base-700 px-3 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-lo">
          The engine
        </span>
        <span className="font-mono text-[10px] tabular-nums text-ink-lo">
          {sourced.length} events
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <AnimatePresence initial={false}>
          {sourced.map((s) => {
            const entry = engineEntryFor(s.event);
            const linked = s.beatId !== "__seed__" && s.beatId === highlightBeatId;
            return (
              <motion.button
                key={s.index}
                type="button"
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                onMouseEnter={() => onHover(s.beatId)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(s.beatId)}
                onBlur={() => onHover(null)}
                onClick={() => onHover(linked ? null : s.beatId)}
                className={`mb-2 block w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  toneStyles[entry.tone]
                } ${linked ? "ring-2 ring-accent-green/70" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-[11px] font-semibold ${toneText[entry.tone]}`}>
                    {entry.name}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-ink-lo">{s.at}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-lo">
                  {entry.detail}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">{entry.reason}</p>
                {s.event.t === "FOOD_LOGGED" ? (
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-lo">
                    {s.event.macros.protein_g}g protein · {s.event.macros.kcal} kcal
                    {s.event.macros.kcal_range
                      ? ` · range ${s.event.macros.kcal_range[0]}–${s.event.macros.kcal_range[1]}`
                      : ""}{" "}
                    · v{s.event.snapshotVersion + 1}
                  </p>
                ) : null}
                {s.event.t === "TARGETS_REVISED" ? (
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-lo">
                    → {s.event.targets.protein_g}g protein · {s.event.targets.carbs_g}g carbs ·{" "}
                    {s.event.targets.kcal} kcal
                  </p>
                ) : null}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
