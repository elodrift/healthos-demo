"use client";

import { motion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";
import type { Targets, Macros } from "@/lib/events";

function Bar({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number;
  unit: string;
}) {
  const shownConsumed = useCountUp(consumed);
  const shownTarget = useCountUp(target);
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;

  return (
    <div className="flex-1 rounded-xl border border-base-700 bg-base-850/80 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-ink-lo">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 tabular-nums">
        <span className="text-2xl font-semibold text-accent-green">
          {Math.round(shownConsumed)}
          {unit}
        </span>
        <span className="text-sm text-ink-lo">/ {Math.round(shownTarget)}{unit}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-base-700">
        <motion.div
          className="h-full rounded-full bg-accent-green"
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
        />
      </div>
    </div>
  );
}

export function MacroHeader({ targets, consumed }: { targets: Targets; consumed: Macros }) {
  return (
    <div className="flex gap-3">
      <Bar label="Protein" consumed={consumed.protein_g} target={targets.protein_g} unit="g" />
      <Bar label="Kcal" consumed={consumed.kcal} target={targets.kcal} unit="" />
    </div>
  );
}
