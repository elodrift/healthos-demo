"use client";

import { motion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";
import type { Macros, Targets } from "@/lib/events";
import { goalModeBadge, type GoalMode } from "@/lib/fixtures/personas";

function Tile({
  label,
  consumed,
  estimated,
  target,
  unit,
  revised,
}: {
  label: string;
  consumed: number;
  estimated: number;
  target: number;
  unit: string;
  revised: boolean;
}) {
  const shownConsumed = useCountUp(consumed);
  const shownTarget = useCountUp(target);
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const estPct = target > 0 ? Math.min(pct, (estimated / target) * 100) : 0;
  const confirmedPct = Math.max(0, pct - estPct);

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-base-700 bg-base-850/80 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-lo">
          {label}
        </span>
        {revised ? (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-accent-amber">
            v2
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[26px] font-semibold leading-none tabular-nums text-accent-green">
          {Math.round(shownConsumed)}
          {unit}
        </span>
        <span className="text-[12px] tabular-nums text-ink-mid">
          / {Math.round(shownTarget)}
          {unit}
        </span>
      </div>
      <div
        className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-base-700"
        role="progressbar"
        aria-valuenow={Math.round(consumed)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-label={`${label} progress`}
      >
        <motion.div
          className="h-full bg-accent-green"
          animate={{ width: `${confirmedPct}%` }}
          transition={{ type: "spring", stiffness: 150, damping: 22 }}
        />
        <motion.div
          className="h-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, #3DDC97 0 3px, rgba(61,220,151,0.25) 3px 7px)",
          }}
          animate={{ width: `${estPct}%` }}
          transition={{ type: "spring", stiffness: 150, damping: 22 }}
        />
      </div>
    </div>
  );
}

export function MacroHeader({
  targets,
  consumed,
  estimated,
  name,
  mode,
  revised,
}: {
  targets: Targets;
  consumed: Macros;
  estimated: Macros;
  name: string;
  mode: GoalMode;
  revised: boolean;
}) {
  return (
    <header className="border-b border-base-700 bg-base-900/95 px-3 pb-3 pt-3 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[11px] font-bold text-accent-green"
        >
          OS
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink-hi">HealthOS</div>
          <div className="truncate text-[11px] text-ink-mid">co-pilot for {name}</div>
        </div>
        <span className="shrink-0 rounded-full border border-base-600 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-mid">
          {goalModeBadge[mode]}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <Tile
          label="Protein"
          consumed={consumed.protein_g}
          estimated={estimated.protein_g}
          target={targets.protein_g}
          unit="g"
          revised={false}
        />
        <Tile
          label="Kcal"
          consumed={consumed.kcal}
          estimated={estimated.kcal}
          target={targets.kcal}
          unit=""
          revised={revised}
        />
      </div>
    </header>
  );
}
