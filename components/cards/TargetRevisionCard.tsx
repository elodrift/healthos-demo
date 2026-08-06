"use client";

// THE CLIMAX. Old targets slide out, new slide in, the protein floor stays
// locked, and the cause tag names exactly what did it.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useCountUp } from "@/lib/useCountUp";
import type { RevisionRow } from "@/lib/fixtures/script-types";

const spring = { type: "spring" as const, stiffness: 220, damping: 24, mass: 0.9 };

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function RevisionNumber({ value }: { value: number }) {
  const shown = useCountUp(value, 700);
  return <>{Math.round(shown).toLocaleString()}</>;
}

function Row({ row, revealed, delay }: { row: RevisionRow; revealed: boolean; delay: number }) {
  const changed = row.from !== row.to;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay }}
      className="flex items-center justify-between gap-3 border-t border-base-700 py-3 first:border-t-0"
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-ink-mid">{row.label}</span>
        {row.locked ? (
          <span className="flex items-center gap-1 rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-green">
            <LockIcon />
            locked
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {changed && !revealed ? (
            <motion.span
              key="from-big"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-2xl font-semibold tabular-nums text-ink-lo"
            >
              {row.from.toLocaleString()}
              {row.unit}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {changed && revealed ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[12px] tabular-nums text-ink-lo line-through"
          >
            {row.from.toLocaleString()}
            {row.unit}
          </motion.span>
        ) : null}

        {revealed || !changed ? (
          <motion.span
            initial={changed ? { opacity: 0, x: 28 } : { opacity: 1 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring}
            className={`text-2xl font-semibold tabular-nums ${
              changed ? "text-accent-amber" : "text-accent-green"
            }`}
          >
            <RevisionNumber value={row.to} />
            {row.unit}
          </motion.span>
        ) : null}
      </div>
    </motion.div>
  );
}

export function TargetRevisionCard({
  causeTag,
  rows,
  lockNote,
  highlighted,
  onHover,
}: {
  causeTag: string;
  rows: RevisionRow[];
  lockNote: string;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 450);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`overflow-hidden rounded-2xl border border-accent-amber/45 bg-base-850 shadow-card ${
        highlighted ? "ring-2 ring-accent-green/70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent-amber/25 bg-accent-amber/10 px-4 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-amber">
          Targets revised · v2
        </span>
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.55 }}
          className="rounded-full border border-accent-amber/40 px-2 py-0.5 font-mono text-[10px] text-accent-amber"
        >
          {causeTag}
        </motion.span>
      </div>

      <div className="px-4 py-1.5">
        {rows.map((row, i) => (
          <Row key={row.label} row={row} revealed={revealed} delay={0.45 + i * 0.09} />
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="border-t border-base-700 px-4 py-3 text-[12px] leading-relaxed text-ink-mid"
      >
        <span className="font-semibold text-accent-green">Protein 185g</span> — {lockNote}
      </motion.p>
    </motion.div>
  );
}
