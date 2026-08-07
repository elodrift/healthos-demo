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

  /*
   * An overage used to be invisible: the number stayed brand-green and the bar
   * clamped at 100%, so 2900 against a 2700 target looked identical to hitting
   * it exactly. Green is the app's "this is fine" signal, so that read as
   * approval of the opposite of what happened.
   *
   * Over target now drops to neutral ink and the bar shows a marker at the
   * boundary. Deliberately NOT red — red is reserved exclusively for the medical
   * never-suspends card (DEMO_SPEC §1.6.6). Being over on carbs is information,
   * not a rule breach, and the two must not look alike.
   */
  const over = target > 0 && consumed > target;

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-base-700 bg-base-850/80 px-2.5 py-1.5">
      <div className="flex items-center gap-1">
        <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-lo">
          {label}
        </span>
        {revised ? (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0 rounded-full bg-accent-green/15 px-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-green"
          >
            v2
          </motion.span>
        ) : null}
      </div>
      {/* stacked, not inline: three tiles at 390px can't fit "620 / 2700" on one line */}
      <div
        className={`mt-1 text-[22px] font-semibold leading-none tabular-nums ${
          over ? "text-ink-hi" : "text-accent-green"
        }`}
      >
        {Math.round(shownConsumed)}
        {unit}
      </div>
      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-mid">
        / {Math.round(shownTarget)}
        {unit}
        {over ? (
          <span className="ml-1 text-ink-lo">
            (+{Math.round(consumed - target)}
            {unit})
          </span>
        ) : null}
      </div>
      <div
        className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-base-700"
        role="progressbar"
        aria-valuenow={Math.round(consumed)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-label={`${label} progress`}
      >
        <motion.div
          className={`h-full ${over ? "bg-ink-mid" : "bg-accent-green"}`}
          animate={{ width: `${confirmedPct}%` }}
          transition={{ type: "spring", stiffness: 150, damping: 22 }}
        />
        {/* hatched = still an estimate, not a confirmed number */}
        <motion.div
          className="h-full"
          style={{
            backgroundImage: over
              ? "repeating-linear-gradient(135deg, #98A5BC 0 3px, rgba(152,165,188,0.25) 3px 7px)"
              : "repeating-linear-gradient(135deg, #3DDC97 0 3px, rgba(61,220,151,0.25) 3px 7px)",
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
    <header className="border-b border-base-700 bg-base-900/95 px-3 pb-2.5 pt-2 backdrop-blur">
      {/*
       * One line, not two. Inside a fixed-height phone every row here is taken
       * directly from the conversation, and the app's own name is the least
       * useful thing on screen — the page header already says it.
       */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[10px] font-bold text-accent-green"
        >
          OS
        </span>
        <div className="min-w-0 flex-1 truncate text-[12px] text-ink-mid">
          co-pilot for <span className="font-semibold text-ink-hi">{name}</span>
        </div>
        <span className="shrink-0 rounded-full border border-base-600 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
          {goalModeBadge[mode]}
        </span>
      </div>

      {/*
       * Carbs earns a tile because carbs is what the 17:00 revision actually
       * moves (320g -> 240g). Without it the header stays silent during the one
       * moment the whole demo is built around.
       */}
      <div className="mt-2 flex gap-1.5">
        <Tile
          label="Protein"
          consumed={consumed.protein_g}
          estimated={estimated.protein_g}
          target={targets.protein_g}
          unit="g"
          revised={false}
        />
        <Tile
          label="Carbs"
          consumed={consumed.carbs_g}
          estimated={estimated.carbs_g}
          target={targets.carbs_g}
          unit="g"
          revised={revised}
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
