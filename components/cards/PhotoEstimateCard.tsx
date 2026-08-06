"use client";

import { CardShell } from "./CardShell";
import type { PhotoObject } from "@/lib/fixtures/scenarios/types";

export function PhotoEstimateCard({
  timestamp,
  objectsDetected,
  unresolvedCount,
  objects,
  highlighted,
  onHover,
}: {
  timestamp: string;
  objectsDetected: number;
  unresolvedCount: number;
  objects: PhotoObject[];
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  return (
    <CardShell eyebrow={`Photo — ${timestamp}`} highlighted={highlighted} onHover={onHover}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-gradient-to-br from-base-700 to-base-900">
        {objects.map((obj) => (
          <div
            key={obj.label}
            className={`absolute rounded-sm border ${
              obj.resolved ? "border-accent-green/70" : "border-dashed border-accent-amber/80"
            }`}
            style={{
              left: `${obj.rect.x * 100}%`,
              top: `${obj.rect.y * 100}%`,
              width: `${obj.rect.w * 100}%`,
              height: `${obj.rect.h * 100}%`,
            }}
          >
            <span
              className={`absolute -top-4 left-0 whitespace-nowrap text-[10px] font-medium tabular-nums ${
                obj.resolved ? "text-accent-green" : "text-accent-amber"
              }`}
            >
              {obj.label} {obj.confidence.toFixed(2)}
              {!obj.resolved && " ?"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-ink-lo">
          vision pass, {objectsDetected} objects
        </span>
        <span className="font-semibold text-accent-amber">{unresolvedCount} unresolved</span>
      </div>
    </CardShell>
  );
}
