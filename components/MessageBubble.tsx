"use client";

import { motion } from "framer-motion";

export function MessageBubble({
  speaker,
  text,
  time,
  highlighted,
  onHover,
}: {
  speaker: "user" | "healthos";
  text: string;
  time: string;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const isUser = speaker === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 26 }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      tabIndex={0}
      className={`flex flex-col outline-none ${isUser ? "items-end" : "items-start"}`}
    >
      <div className="mb-1 flex items-center gap-2 px-1">
        {!isUser ? (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-lo">
            HealthOS
          </span>
        ) : null}
        <span className="font-mono text-[10px] tabular-nums text-ink-lo">{time}</span>
      </div>
      <div
        // ch cap keeps the measure readable when the phone frame is not in play
        className={`max-w-[min(88%,60ch)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? "rounded-br-md border border-base-600 bg-base-700 text-ink-hi"
            : "rounded-bl-md border border-base-700 bg-base-850 text-ink-hi shadow-card"
        } ${highlighted ? "ring-2 ring-accent-green/70" : ""}`}
      >
        {text}
      </div>
    </motion.div>
  );
}
