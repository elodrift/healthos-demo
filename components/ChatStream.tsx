"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/lib/store";
import { useDemoState } from "@/lib/useDemoState";
import { scenario } from "@/lib/fixtures/scenarios/boat-trip";
import { closingMessage } from "@/lib/fixtures/copy";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChipBar } from "./ChipBar";
import { PlannedVarianceCard } from "./cards/PlannedVarianceCard";
import { RebalancedCard } from "./cards/RebalancedCard";
import { PhotoEstimateCard } from "./cards/PhotoEstimateCard";
import { TargetRevisionCard } from "./cards/TargetRevisionCard";

export function ChatStream() {
  const { revealedBeats, demoState, pendingChoice } = useDemoState();
  const typingBeatId = usePlayerStore((s) => s.typingBeatId);
  const dimming = usePlayerStore((s) => s.dimming);
  const highlightedBeatId = usePlayerStore((s) => s.highlightedBeatId);
  const setHighlight = usePlayerStore((s) => s.setHighlight);
  const choose = usePlayerStore((s) => s.choose);
  const skipTyping = usePlayerStore((s) => s.skipTyping);
  const started = usePlayerStore((s) => s.started);
  const start = usePlayerStore((s) => s.start);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [revealedBeats.length, typingBeatId, pendingChoice]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {dimming && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-base-950/70 transition-opacity duration-200" />
      )}

      <div className="flex items-center gap-3 border-b border-base-700 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
          ♥
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-hi">HealthOS</div>
          <div className="text-[11px] text-accent-amber">co-pilot for {scenario.persona.displayName}</div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" onClick={skipTyping}>
        {revealedBeats.map((beat) => {
          const highlighted = highlightedBeatId === beat.id;
          const onHover = (h: boolean) => setHighlight(h ? beat.id : null);

          switch (beat.kind) {
            case "message": {
              const text = beat.id === "closing-message" ? closingMessage(demoState.remaining) : beat.text;
              return (
                <MessageBubble
                  key={beat.id}
                  speaker={beat.speaker}
                  text={text}
                  highlighted={highlighted}
                  onHover={onHover}
                />
              );
            }
            case "planned-variance-card":
              return (
                <PlannedVarianceCard
                  key={beat.id}
                  medicalRules={scenario.persona.medicalNeverSuspends}
                  highlighted={highlighted}
                  onHover={onHover}
                />
              );
            case "rebalanced-card":
              return (
                <RebalancedCard key={beat.id} rows={beat.rows} highlighted={highlighted} onHover={onHover} />
              );
            case "photo-card":
              return (
                <PhotoEstimateCard
                  key={beat.id}
                  timestamp={beat.timestamp}
                  objectsDetected={beat.objectsDetected}
                  unresolvedCount={beat.unresolvedCount}
                  objects={beat.objects}
                  highlighted={highlighted}
                  onHover={onHover}
                />
              );
            case "target-revision-card": {
              const revisedEvent = beat.events[0];
              if (revisedEvent.t !== "TARGETS_REVISED") return null;
              return (
                <TargetRevisionCard
                  key={beat.id}
                  causeTag={beat.causeTag}
                  before={scenario.persona.baselineTargets}
                  after={revisedEvent.targets}
                  remaining={demoState.remaining}
                  highlighted={highlighted}
                  onHover={onHover}
                />
              );
            }
            case "choice":
              return null; // rendered via the ChipBar below, not as a bubble
          }
        })}

        {!started && revealedBeats.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
            <p className="max-w-[240px] text-sm text-ink-lo">
              One disrupted Saturday, replayed beat for beat. Tap to start it.
            </p>
          </div>
        )}

        {typingBeatId && <TypingIndicator />}

        <div ref={endRef} />
      </div>

      {!started && (
        <div className="border-t border-base-700">
          <ChipBar
            options={[
              {
                id: "start",
                label: "boat trip saturday, all day thing. should I just write saturday off?",
              },
            ]}
            onSelect={() => start()}
          />
        </div>
      )}

      {pendingChoice && (
        <div className="border-t border-base-700">
          <p className="px-4 pt-2 text-[11px] text-ink-lo">your move — tap a reply</p>
          <ChipBar
            options={pendingChoice.options.map((o) => ({ id: o.id, label: o.label }))}
            onSelect={(optionId) => choose(pendingChoice.id, optionId)}
          />
        </div>
      )}
    </div>
  );
}
