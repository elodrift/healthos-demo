"use client";

import { usePlayerStore } from "@/lib/store";
import { useDemoState } from "@/lib/useDemoState";
import { MacroHeader } from "./MacroHeader";
import { PhoneFrame } from "./PhoneFrame";
import { ChatStream } from "./ChatStream";
import { EngineFeed } from "./EngineFeed";
import { TimelineScrubber } from "./TimelineScrubber";

export function DemoShell() {
  const { sourced, revealedBeats, timeline, demoState } = useDemoState();
  const activeTab = usePlayerStore((s) => s.activeTab);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const highlightedBeatId = usePlayerStore((s) => s.highlightedBeatId);
  const setHighlight = usePlayerStore((s) => s.setHighlight);
  const autoplay = usePlayerStore((s) => s.autoplay);
  const setAutoplay = usePlayerStore((s) => s.setAutoplay);
  const scrubTo = usePlayerStore((s) => s.scrubTo);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 pt-4 lg:px-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-ink-hi">HealthOSJourney</span>
        <span className="rounded-full border border-base-600 bg-base-850 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-accent-green">
          strict &amp; sustainable
        </span>
      </div>

      <MacroHeader targets={demoState.targets} consumed={demoState.consumed} />

      <div className="flex gap-1 rounded-full border border-base-700 bg-base-850 p-1 lg:hidden">
        {(["channel", "engine"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              activeTab === tab ? "bg-accent-green/15 text-accent-green" : "text-ink-lo"
            }`}
          >
            {tab === "channel" ? "The channel" : "The engine"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={activeTab === "channel" ? "block" : "hidden lg:block"}>
          <PhoneFrame>
            <TimelineScrubber
              total={timeline.length}
              current={revealedBeats.length}
              onScrub={(i) => scrubTo(i)}
              autoplay={autoplay}
              onToggleAutoplay={setAutoplay}
            />
            <ChatStream />
          </PhoneFrame>
        </div>

        <div className={activeTab === "engine" ? "block" : "hidden lg:block"}>
          <div className="mx-auto h-[720px] max-h-[80vh] w-full max-w-[420px] rounded-[2rem] border border-base-700 bg-base-900/60 lg:h-[760px]">
            <EngineFeed sourced={sourced} highlightedBeatId={highlightedBeatId} onHover={setHighlight} />
          </div>
        </div>
      </div>
    </div>
  );
}
