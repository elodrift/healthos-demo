"use client";

import { motion } from "framer-motion";

/** The only input surface in the demo — no free typing, ever. */
export function ChipBar({
  options,
  onSelect,
}: {
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 26 }}
      className="flex flex-col gap-2 border-t border-base-700 bg-base-900/95 px-3 py-3 backdrop-blur"
    >
      <span className="px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-lo">
        Your reply
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className="rounded-full border border-accent-green/40 bg-accent-green/10 px-3.5 py-2 text-left text-[13px] font-medium leading-snug text-ink-hi transition hover:border-accent-green hover:bg-accent-green/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.98]"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
