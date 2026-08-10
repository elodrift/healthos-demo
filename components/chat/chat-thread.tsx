"use client";

import { useEffect, useRef, useState } from "react";

export type ChatTurn = {
  id: number | string;
  role: string;
  text: string;
  source: string;
};

/**
 * The chat surface.
 *
 * `source` is rendered, not hidden. A reply the engine derived from the user's
 * own logged rows and a reply a model improvised are different kinds of claim,
 * and §4.11's ban on presenting an assumption as a measurement applies to our own
 * machinery too. So an engine-derived answer is labelled ENGINE, a model one
 * MODEL, and an admission that the model was unreachable DEGRADED. The user can
 * always tell which one they are reading.
 */
export function ChatThread({ initialTurns }: { initialTurns: ChatTurn[] }) {
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  async function send() {
    const message = draft.trim();
    if (!message || pending) return;

    setDraft("");
    setError(null);
    setPending(true);
    // Optimistic: the user's own words are never in doubt, so showing them
    // immediately cannot misrepresent anything.
    setTurns((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", text: message, source: "user" }]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          // The server needs the user's zone to know which day "today" is.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "That did not go through.");
        return;
      }

      const data = (await res.json()) as { text: string; source: string };
      setTurns((prev) => [
        ...prev,
        { id: `agent-${Date.now()}`, role: "agent", text: data.text, source: data.source },
      ]);
    } catch {
      setError("The network dropped that one. Nothing was logged.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {turns.length === 0 ? <EmptyState /> : null}

        {turns.map((turn) => (
          <Turn key={turn.id} turn={turn} />
        ))}

        {pending ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo" aria-live="polite">
            Thinking
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-base-700 bg-base-900 px-4 py-3 text-[13px] leading-relaxed text-ink-lo">
            {error}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-base-700 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message HealthOS
        </label>
        <textarea
          id="chat-input"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks. `isComposing` guards CJK IMEs,
            // where Enter confirms a candidate rather than submitting; keyCode
            // 229 is Safari's unreliable final composition event.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="What did you eat, or what do you want to know?"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-base-700 bg-base-900 px-4 py-3 text-[14px] leading-relaxed text-ink-hi placeholder:text-ink-lo focus:outline-none focus:ring-2 focus:ring-accent-green/40"
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="min-h-[44px] rounded-xl bg-accent-green px-4 text-[14px] font-semibold text-base-950 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
      <p className="text-[13px] leading-relaxed text-ink-lo">
        Tell it what you ate, or ask where you stand. It answers from your logged
        meals and today&apos;s plan — and when it does not have a number, it says
        so instead of inventing one.
      </p>
    </div>
  );
}

/** Labels for where a reply came from. The user's own turns need no label. */
const SOURCE_LABEL: Record<string, string> = {
  local: "Engine",
  model: "Model",
  degraded: "No data",
};

function Turn({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-base-800 px-4 py-3 text-[14px] leading-relaxed text-ink-hi">
          {turn.text}
        </p>
      </div>
    );
  }

  const label = SOURCE_LABEL[turn.source] ?? turn.source;

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
          turn.source === "degraded" ? "text-ink-lo" : "text-accent-green"
        }`}
      >
        {label}
      </span>
      <p className="max-w-[95%] whitespace-pre-wrap text-[14px] leading-relaxed text-ink-hi">
        {turn.text}
      </p>
    </div>
  );
}
