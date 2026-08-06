"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePlayerStore } from "@/lib/store";

/**
 * Free typing. The scripted day is a rail; this is the exit from it.
 *
 * Two details that matter more than they look:
 *  - typing pauses the day, and the pause is *shown*, with a way back. A demo
 *    that keeps narrating over you feels broken.
 *  - the reply source is labelled. When the deterministic matcher answered, we
 *    say so. That is the point being made — the parts with consequences are not
 *    left to a model.
 */

const SUGGESTIONS = [
  "I skipped the gym",
  "I just had pad thai",
  "Can I have grapefruit?",
  "How am I doing?",
];

const SOURCE_LABEL: Record<string, string> = {
  matcher: "answered by the rules engine",
  guardrail: "model deferred — rules engine answered",
  model: "answered by the language model",
};

export function Composer() {
  const [value, setValue] = useState("");
  const send = usePlayerStore((s) => s.sendMessage);
  const resume = usePlayerStore((s) => s.resume);
  const paused = usePlayerStore((s) => s.paused);
  const thinking = usePlayerStore((s) => s.thinking);
  const source = usePlayerStore((s) => s.lastReplySource);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    void send(trimmed);
  }

  return (
    <div className="flex flex-col border-t border-base-700 bg-base-900">
      <AnimatePresence initial={false}>
        {paused ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-base-700"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo">
                {source ? SOURCE_LABEL[source] : "day paused"}
              </span>
              <button
                type="button"
                onClick={resume}
                className="rounded-full border border-base-600 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mid transition hover:border-accent-green/60 hover:text-accent-green"
              >
                Resume the day
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!paused ? (
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="whitespace-nowrap rounded-full border border-base-600 px-3 py-1.5 text-[12px] text-ink-mid transition hover:border-accent-green/60 hover:text-accent-green"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex items-end gap-2 px-3 py-2.5"
      >
        <label htmlFor="composer" className="sr-only">
          Tell HealthOS what changed
        </label>
        <textarea
          id="composer"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, but never while an IME is mid-composition.
            if (e.key !== "Enter" || e.shiftKey) return;
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            submit(value);
          }}
          placeholder="Tell me what you ate, or what changed"
          className="max-h-24 min-h-[42px] flex-1 resize-none rounded-2xl border border-base-600 bg-base-850 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-hi outline-none transition placeholder:text-ink-lo focus:border-accent-green/60"
        />
        <button
          type="submit"
          disabled={!value.trim() || thinking}
          aria-label="Send"
          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-accent-green text-base-950 transition disabled:bg-base-700 disabled:text-ink-lo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12h13M12 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
