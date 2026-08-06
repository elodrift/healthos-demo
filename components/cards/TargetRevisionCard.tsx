"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CardShell } from "./CardShell";
import type { Targets, Macros } from "@/lib/events";

function MetricRow({ label, before, after, unit }: { label: string; before: number; after: number; unit: string }) {
  const [showAfter, setShowAfter] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowAfter(true), 380);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-center justify-between border-b border-base-700 py-2.5 last:border-b-0">
      <span className="text-sm text-ink-mid">{label}</span>
      <div className="relative h-6 w-24 overflow-hidden text-right">
        <AnimatePresence mode="popLayout">
          {!showAfter ? (
            <motion.span
              key="before"
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ type: "spring", stiffness: 260, damping: 24, duration: 0.4 }}
              className="absolute right-0 top-0 block tabular-nums text-ink-lo line-through decoration-accent-red/60"
            >
              {before}{unit}
            </motion.span>
          ) : (
            <motion.span
              key="after"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24, duration: 0.45 }}
              className="absolute right-0 top-0 block tabular-nums font-semibold text-accent-green"
            >
              {after}{unit}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function TargetRevisionCard({
  causeTag,
  before,
  after,
  remaining,
  highlighted,
  onHover,
}: {
  causeTag: string;
  before: Targets;
  after: Targets;
  remaining: Macros;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  return (
    <CardShell eyebrow="Target revision" highlighted={highlighted} onHover={onHover}>
      <span className="mb-3 inline-block rounded-full border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1 text-[11px] font-medium text-accent-amber">
        {causeTag}
      </span>
      <div className="mb-3">
        <MetricRow label="Protein floor" before={before.protein_g} after={after.protein_g} unit="g" />
        <MetricRow label="Kcal ceiling" before={before.kcal} after={after.kcal} unit="" />
      </div>
      <div className="rounded-xl border border-base-700 bg-base-800/70 p-3">
        <div className="text-[10px] font-medium uppercase tracking-widest text-ink-lo">
          Tonight, remaining
        </div>
        <div className="mt-1 flex items-baseline gap-4 tabular-nums">
          <span className="text-xl font-semibold text-ink-hi">
            {Math.round(remaining.protein_g)}g <span className="text-xs font-normal text-ink-lo">protein</span>
          </span>
          <span className="text-xl font-semibold text-ink-hi">
            {Math.round(remaining.kcal)} <span className="text-xs font-normal text-ink-lo">kcal</span>
          </span>
        </div>
      </div>
    </CardShell>
  );
}
