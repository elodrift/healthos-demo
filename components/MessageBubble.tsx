"use client";

import { motion } from "framer-motion";

export function MessageBubble({
  speaker,
  text,
  highlighted,
  onHover,
}: {
  speaker: "user" | "healthos";
  text: string;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const isUser = speaker === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      {!isUser && (
        <span className="mb-1 pl-1 text-[10px] font-semibold uppercase tracking-widest text-ink-lo">
          HealthOS
        </span>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed transition-shadow ${
          isUser
            ? "rounded-br-sm bg-accent-blue/90 text-white"
            : "rounded-bl-sm bg-base-800 text-ink-hi"
        } ${highlighted ? "ring-2 ring-accent-green/70" : ""}`}
      >
        {text}
      </div>
    </motion.div>
  );
}
