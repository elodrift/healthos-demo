"use client";

import Link from "next/link";
import { usePlayerStore } from "@/lib/store";
import { useDemoState } from "@/lib/useDemoState";
import { personaById } from "@/lib/fixtures/personas";
import { dayClock } from "@/lib/fixtures/day-script";
import { MacroHeader } from "./MacroHeader";
import { PhoneFrame } from "./PhoneFrame";
import { ChatStream } from "./ChatStream";
import { EngineFeed } from "./EngineFeed";
import { TimelineScrubber } from "./TimelineScrubber";
import { QuickSetup } from "./QuickSetup";
import { DemoFooter } from "./DemoFooter";

export function DemoShell() {
  const { sourced, demoState, currentTime, clockIndex, isDone } = useDemoState();
  const phase = usePlayerStore((s) => s.phase);
  const activeTab = usePlayerStore((s) => s.activeTab);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const highlightBeatId = usePlayerStore((s) => s.highlightBeatId);
  const setHighlight = usePlayerStore((s) => s.setHighlight);
  const scrubToIndex = usePlayerStore((s) => s.scrubToIndex);
  const replayFromDisruption = usePlayerStore((s) => s.replayFromDisruption);
  const personaId = usePlayerStore((s) => s.personaId);
  const mode = usePlayerStore((s) => s.mode);

  const persona = personaById(personaId);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1000px] flex-col md:px-6 md:py-5">
      <div className="hidden items-center justify-between pb-3 md:flex">
        <Link href="/" className="text-sm font-semibold tracking-tight text-ink-hi">
          HealthOS
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-lo">
          One day with HealthOS
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-4 md:flex-row md:justify-center">
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            activeTab === "channel" ? "flex" : "hidden md:flex"
          } md:flex-none`}
        >
          <PhoneFrame>
            {phase === "setup" ? (
              <>
                <div className="border-b border-base-700 px-4 py-3">
                  <div className="text-[13px] font-semibold text-ink-hi">Quick setup</div>
                  <div className="text-[11px] text-ink-mid">Twenty seconds, then the day runs.</div>
                </div>
                <QuickSetup />
              </>
            ) : (
              <>
                <MacroHeader
                  targets={demoState.targets}
                  consumed={demoState.consumed}
                  estimated={demoState.estimated}
                  name={persona.displayName}
                  mode={mode}
                  revised={demoState.revisions.length > 0}
                />
                <TimelineScrubber
                  stops={dayClock}
                  clockIndex={clockIndex}
                  currentTime={currentTime}
                  onScrub={scrubToIndex}
                />
                <ChatStream />
                {isDone ? (
                  <div className="flex flex-col gap-2 border-t border-base-700 bg-base-900 px-3 py-3">
                    <Link
                      href="/results"
                      className="rounded-full bg-accent-green px-5 py-3 text-center text-[15px] font-semibold text-base-950 transition hover:brightness-110"
                    >
                      See 4 weeks later
                    </Link>
                    <button
                      type="button"
                      onClick={replayFromDisruption}
                      className="rounded-full border border-base-600 px-5 py-3 text-center text-[13px] font-medium text-ink-mid transition hover:border-accent-green/60 hover:text-accent-green"
                    >
                      Replay the day differently
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </PhoneFrame>
        </div>

        <div
          className={`min-h-0 flex-1 flex-col ${
            activeTab === "engine" ? "flex" : "hidden md:flex"
          } md:w-[380px] md:flex-none lg:w-[420px]`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-base-700 bg-base-900/60 md:h-[min(844px,calc(100dvh-6.5rem))] md:flex-none md:rounded-3xl md:border">
            <EngineFeed
              sourced={sourced}
              highlightBeatId={highlightBeatId}
              onHover={setHighlight}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-t border-base-700 bg-base-900 p-1.5 md:hidden">
        {(["channel", "engine"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-full py-2.5 text-[13px] font-medium transition ${
              activeTab === tab
                ? "bg-accent-green/15 text-accent-green"
                : "text-ink-lo hover:text-ink-mid"
            }`}
          >
            {tab === "channel" ? "The channel" : `The engine · ${sourced.length}`}
          </button>
        ))}
      </div>

      <DemoFooter />
    </div>
  );
}
