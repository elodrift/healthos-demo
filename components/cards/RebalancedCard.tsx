"use client";

import { CardShell } from "./CardShell";
import type { RebalancedRow } from "@/lib/fixtures/scenarios/types";

export function RebalancedCard({
  rows,
  highlighted,
  onHover,
}: {
  rows: RebalancedRow[];
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  return (
    <CardShell eyebrow="Rebalanced" highlighted={highlighted} onHover={onHover}>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-hi">{row.label}</div>
              <div className="text-xs text-ink-mid">{row.detail}</div>
            </div>
            <span className="shrink-0 tabular-nums text-sm font-medium text-accent-green">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}
