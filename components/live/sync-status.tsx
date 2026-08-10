"use client";

/**
 * How old the wearable data behind this plan is, and a way to ask for newer.
 *
 * The age is the point. Recovery is fixed at wake, but strain accrues all day and
 * now moves the carb target, so a plan read at 22:00 off a 09:00 sync is built on
 * a number the user's watch has already moved past. Showing the plan without its
 * age would let them assume it is current — the §4.11 failure, one layer up from
 * the macros.
 *
 * React 18.3 in this project: no `useActionState`/`useFormStatus` (they typecheck,
 * then throw at runtime). Pending state is a plain `useState`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshWearable } from "@/app/actions/live";

/** Past this, the reading is old enough to say so unprompted. */
const STALE_AFTER_MS = 60 * 60 * 1000;

function describeAge(syncedAt: Date, now: number): { text: string; stale: boolean } {
  const ms = Math.max(0, now - syncedAt.getTime());
  const mins = Math.floor(ms / 60_000);

  if (mins < 1) return { text: "just now", stale: false };
  if (mins < 60) return { text: `${mins} min ago`, stale: ms >= STALE_AFTER_MS };

  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return { text: `${hours}h ago`, stale: true };

  const days = Math.floor(hours / 24);
  return { text: `${days}d ago`, stale: true };
}

export function SyncStatus({
  syncedAt,
  servedFromFreshStore,
  reachedProvider,
}: {
  /** Serialized over the RSC boundary, so this arrives as a string or null. */
  syncedAt: string | null;
  servedFromFreshStore: boolean;
  /**
   * Whether WHOOP itself answered on this render.
   *
   * Without this the component only knew when a *row* was written, so a plan
   * served from cache during an outage rendered "Read just now" — describing our
   * own database write as though it were a reading from the user's watch, and
   * directly contradicting the outage notice on the same screen. An age is only
   * meaningful once we say what it is the age of.
   */
  reachedProvider: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const parsed = syncedAt ? new Date(syncedAt) : null;
  // Computed once per render rather than on a ticking timer: a live-counting
  // "12 min ago" is motion that earns nothing and re-renders the whole rail.
  const age = parsed ? describeAge(parsed, Date.now()) : null;

  async function onRefresh() {
    setPending(true);
    setMessage(null);
    try {
      const result = await refreshWearable();
      if (result.ok) {
        /*
         * `refreshWearable` only clears the freshness stamp so the next render
         * re-fetches; it does not itself call WHOOP, so its `ok` means "a fetch
         * will be attempted", NOT "a fetch succeeded".
         *
         * This previously said "Pulled fresh data from WHOOP." and rendered
         * directly above "WHOOP could not be reached" when the token was bad —
         * the button asserted a successful sync that never happened. The result
         * of the attempt is reported by the line above, which reads the actual
         * outcome after `router.refresh()`, so this only describes the request.
         */
        router.refresh();
        setMessage("Asked WHOOP for a new reading. The status above shows the result.");
      } else if (result.reason === "COOLDOWN") {
        setMessage(`Just synced. Try again in ${result.retryInSeconds}s.`);
      } else {
        setMessage("No WHOOP account is connected.");
      }
    } catch {
      setMessage("Could not reach WHOOP. Your stored reading is unchanged.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-700 bg-base-900 px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          WHOOP data
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-mid">
          {age === null ? (
            "Never synced on this device."
          ) : !reachedProvider ? (
            /*
             * The outage leads. "Stored" rather than "Read" because nothing was
             * read from the watch on this render, and the age is explicitly
             * attributed to the stored copy so it cannot be misread as a sync.
             */
            <>
              WHOOP could not be reached. Showing the reading stored{" "}
              <span className="font-mono text-ink-hi">{age.text}</span>.
            </>
          ) : (
            <>
              Read{" "}
              <span className={age.stale ? "text-ink-hi" : "font-mono text-ink-hi"}>
                {age.text}
              </span>
              {age.stale
                ? ". Strain moves during the day, so this may be behind your watch."
                : servedFromFreshStore
                  ? ". Reused rather than re-fetched."
                  : "."}
            </>
          )}
        </p>
        {message ? (
          <p role="status" className="mt-1.5 text-[12px] leading-relaxed text-ink-lo">
            {message}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={pending}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-base-700 px-3.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-hi transition hover:border-accent-green hover:text-accent-green disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Refresh"}
      </button>
    </section>
  );
}
