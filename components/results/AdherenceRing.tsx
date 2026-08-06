"use client";

import { motion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";

export function AdherenceRing({ value }: { value: number }) {
  const shown = useCountUp(value, 900);
  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#1A2440" strokeWidth="7" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="#3DDC97"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums text-ink-hi">
        {Math.round(shown)}%
      </span>
    </div>
  );
}
