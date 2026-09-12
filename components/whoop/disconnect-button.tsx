"use client";

import { useState, useTransition } from "react";
import { disconnectWhoop, type DisconnectResult } from "@/app/actions/whoop";

/**
 * Disconnect control for /connect/whoop.
 *
 * Two-step by design. Disconnecting revokes the grant at WHOOP, so an accidental
 * tap costs a full round trip through OAuth to undo — that earns a confirm step,
 * where logging a meal does not.
 *
 * The result message is rendered verbatim from the server rather than reduced to
 * "Done", because a partial disconnect leaves the user with something still to do
 * in WHOOP's own settings.
 */
export function DisconnectWhoopButton({ connected }: { connected: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<DisconnectResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await disconnectWhoop();
      setResult(r);
      setConfirming(false);
    });
  }

  // The result outranks `connected`, and must be checked first. After a
  // successful disconnect `connected` is false, so testing it first would hide
  // the outcome message the user still needs to read.
  if (result) {
    return (
      <p
        role="status"
        className={
          "mt-4 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed " +
          (result.ok
            ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
            : "border-accent-red/30 bg-accent-red/10 text-accent-red")
        }
      >
        {result.ok ? result.message : result.error}
      </p>
    );
  }

  // Nothing to disconnect, and no outcome to report.
  if (!connected) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-base-700 bg-base-900 px-4 text-[14px] font-semibold text-ink-mid transition-colors hover:border-accent-red/40 hover:text-accent-red"
      >
        Disconnect WHOOP
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-accent-red/30 bg-accent-red/5 p-4">
      <p className="text-[13px] leading-relaxed text-ink-mid">
        This deletes the stored tokens and revokes access at WHOOP, so no further data can be
        read. Recovery and sleep already synced stay in your history — email the address in the{" "}
        <a
          href="/privacy"
          className="underline decoration-ink-lo/40 underline-offset-2 hover:text-accent-green"
        >
          privacy policy
        </a>{" "}
        to have those deleted too.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={run}
          disabled={isPending}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-accent-red px-4 text-[14px] font-semibold text-base-950 transition-opacity disabled:opacity-60"
        >
          {isPending ? "Disconnecting…" : "Yes, disconnect"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-base-700 bg-base-900 px-4 text-[14px] font-semibold text-ink-mid disabled:opacity-60"
        >
          Keep connected
        </button>
      </div>
    </div>
  );
}
