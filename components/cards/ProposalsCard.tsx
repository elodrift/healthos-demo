"use client";

import { useEffect, useRef } from "react";
import { CardShell } from "./CardShell";
import { usePlayerStore } from "@/lib/store";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M4 12.5l5 5L20 6.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The proposals card — the one place the user disposes.
 *
 * The design audit's central finding was that the agent kept saying "your call"
 * and "I am not moving anything until you pick" while offering nothing to pick
 * with. The proposals were rendered as an ordered list, so the product made a
 * promise in copy that the interface then broke. Everything visible was the
 * agent's; nothing was the user's.
 *
 * So the numbered <ol> becomes real radio-style buttons, and choosing one
 * commits it and prints a receipt naming the choice. Selection deliberately
 * moves no macro and emits no DemoEvent — committing to "hold room for dinner"
 * is a statement of intent, not a claim that food was eaten (DNA §4.12).
 *
 * Targets are 56px tall to clear the 44px minimum the audit flagged, and the
 * chosen state is carried by the brand green, never red: red stays exclusive to
 * the medical never-suspends card so it keeps its guardrail meaning
 * (DEMO_SPEC §1.6.6, and the audit's own page 6).
 */
export function ProposalsCard({
  beatId,
  items,
  highlighted,
  onHover,
}: {
  beatId: string;
  items: string[];
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const chosen = usePlayerStore((s) => s.chosenProposals[beatId]);
  const chooseProposal = usePlayerStore((s) => s.chooseProposal);
  const decided = chosen !== undefined;

  /*
   * Committing grows the card by the height of the receipt, and ChatStream's
   * auto-scroll only re-runs when a new beat arrives — so the confirmation the
   * user just earned appeared underneath the composer. Nudge the receipt into
   * view once, on the transition to decided.
   *
   * `block: "nearest"` so an already-visible receipt does not yank the column.
   */
  const receiptRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!decided) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => {
      receiptRef.current?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "nearest",
      });
    }, 60);
    return () => window.clearTimeout(id);
  }, [decided]);

  return (
    <CardShell eyebrow="Your call" highlighted={highlighted} onHover={onHover}>
      <div role="radiogroup" aria-label="Proposals" className="flex flex-col gap-2">
        {items.map((item, i) => {
          const isChosen = chosen === i;
          return (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={isChosen}
              onClick={() => chooseProposal(beatId, i)}
              className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-relaxed transition ${
                isChosen
                  ? "border-accent-green/70 bg-accent-green/10 text-ink-hi"
                  : decided
                    ? "border-base-700 bg-base-850/40 text-ink-lo hover:border-base-600 hover:text-ink-mid"
                    : "border-base-600 bg-base-850 text-ink-mid hover:border-accent-green/50 hover:text-ink-hi"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${
                  isChosen
                    ? "border-accent-green bg-accent-green text-base-900"
                    : "border-base-600 text-ink-lo"
                }`}
              >
                {isChosen ? <CheckIcon /> : i + 1}
              </span>
              {item}
            </button>
          );
        })}
      </div>

      {/*
        The receipt. Without it, committing is indistinguishable from hovering —
        the audit's "no completion state" point. aria-live so the confirmation is
        announced rather than only shown.
      */}
      <p
        ref={receiptRef}
        aria-live="polite"
        className={`mt-3 border-t pt-3 text-[12px] leading-relaxed ${
          decided ? "border-accent-green/25 text-ink-mid" : "border-base-700 text-ink-lo"
        }`}
      >
        {decided ? (
          <>
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent-green">
              Locked in ·{" "}
            </span>
            {items[chosen]}. Nothing else moved — no food logged, targets
            untouched until you eat.
          </>
        ) : (
          "Nothing moves until you pick one."
        )}
      </p>
    </CardShell>
  );
}
