"use client";

import { motion } from "framer-motion";

export function CardShell({
  eyebrow,
  highlighted,
  onHover,
  children,
  accent = "default",
}: {
  eyebrow: string;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
  children: React.ReactNode;
  accent?: "default" | "red";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`rounded-2xl border bg-base-850 px-4 py-4 shadow-card transition-shadow ${
        accent === "red" ? "border-accent-red/40" : "border-base-700"
      } ${highlighted ? "ring-2 ring-accent-green/70" : ""}`}
    >
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-ink-lo">
        {eyebrow}
      </div>
      {children}
    </motion.div>
  );
}
