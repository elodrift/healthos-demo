"use client";

import { CardShell } from "./CardShell";
import type { MedicalRule } from "@/lib/fixtures/personas/types";

export function PlannedVarianceCard({
  medicalRules,
  highlighted,
  onHover,
}: {
  medicalRules: MedicalRule[];
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  return (
    <CardShell eyebrow="Saturday, planned variance" highlighted={highlighted} onHover={onHover}>
      <h3 className="text-lg font-semibold text-ink-hi">not a cheat day</h3>
      <p className="mb-3 text-sm text-ink-mid">a day with different tolerances</p>
      <div className="rounded-xl border border-accent-red/50 bg-accent-red/[0.06] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-accent-red">
            <span aria-hidden>▲</span> Never suspends
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-red">
            Medical
          </span>
        </div>
        <ul className="mb-3 space-y-1.5">
          {medicalRules.map((rule) => (
            <li key={rule.id} className="flex items-start gap-2 text-sm text-ink-hi">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-red" />
              {rule.label}
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-ink-mid">
          These are not preferences and Saturday does not change them. If anything I watch harder,
          because unplanned food is where interactions hide.
        </p>
      </div>
    </CardShell>
  );
}
