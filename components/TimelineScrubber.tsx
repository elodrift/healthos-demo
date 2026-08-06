"use client";

import { motion } from "framer-motion";

/** 06:30 → 22:00. Tapping a past stop replays the day from there. */
export function TimelineScrubber({
  stops,
  clockIndex,
  currentTime,
  onScrub,
}: {
  stops: string[];
  clockIndex: number[];
  currentTime: string;
  onScrub: (index: number) => void;
}) {
  const activeStop = Math.max(
    0,
    stops.reduce((acc, t, i) => (t <= currentTime ? i : acc), 0),
  );
  const pct = stops.length > 1 ? (activeStop / (stops.length - 1)) * 100 : 0;

  return (
    <div className="border-b border-base-700 bg-base-900/95 px-3 py-2.5">
      <div className="relative h-1.5 rounded-full bg-base-700">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-accent-green"
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 24 }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {stops.map((t, i) => {
          const reached = i <= activeStop;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onScrub(clockIndex[i])}
              aria-label={`Replay from ${t}`}
              aria-current={i === activeStop ? "step" : undefined}
              className={`-mt-3 flex flex-col items-center gap-1 rounded px-1 py-0.5 font-mono text-[9px] tabular-nums transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-green ${
                i === activeStop
                  ? "text-accent-green"
                  : reached
                    ? "text-ink-mid hover:text-accent-green"
                    : "text-ink-lo hover:text-ink-mid"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full border ${
                  i === activeStop
                    ? "border-accent-green bg-accent-green"
                    : reached
                      ? "border-accent-green/60 bg-accent-green/40"
                      : "border-base-500 bg-base-800"
                }`}
              />
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
