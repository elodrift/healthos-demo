"use client";

import { motion } from "framer-motion";

export function CardShell({
  eyebrow,
  highlighted,
  onHover,
  children,
  accent = "default",
}: {
  eyebrow?: string;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
  children: React.ReactNode;
  /** "red" is reserved for the medical NEVER SUSPENDS card only */
  accent?: "default" | "red" | "amber" | "green";
}) {
  const border =
    accent === "red"
      ? "border-accent-red/50"
      : accent === "amber"
        ? "border-accent-amber/45"
        : accent === "green"
          ? "border-accent-green/40"
          : "border-base-700";

  const eyebrowColor =
    accent === "red"
      ? "text-accent-red"
      : accent === "amber"
        ? "text-accent-amber"
        : accent === "green"
          ? "text-accent-green"
          : "text-ink-lo";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 230, damping: 25 }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`rounded-2xl border bg-base-850 px-4 py-4 shadow-card ${border} ${
        highlighted ? "ring-2 ring-accent-green/70" : ""
      }`}
    >
      {eyebrow ? (
        <div
          className={`mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${eyebrowColor}`}
        >
          {eyebrow}
        </div>
      ) : null}
      {children}
    </motion.div>
  );
}
