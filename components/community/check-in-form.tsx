"use client";

import { useRef, useState } from "react";
import { createCheckIn, type CheckInFormState } from "@/app/actions/community";

const INITIAL: CheckInFormState = {};

/**
 * Add a place.
 *
 * Two things are deliberately opt-in and both default to off:
 *
 * - **Location.** Coordinates are only attached if the user presses the button,
 *   which triggers the browser's own permission prompt. Nothing is geocoded from
 *   the typed name.
 * - **Sharing.** The checkbox is unchecked, matching the founder's §8 ruling and
 *   the column default. A user who ignores this form entirely shares nothing.
 */
export function CheckInForm() {
  /*
   * Submitted through a plain async handler rather than `useActionState`.
   *
   * This project is on React 18.3.1, where `useActionState` does not exist —
   * neither does `react-dom`'s `useFormState` in this build. An earlier draft
   * used the React 19 hook: it typechecked and it *built*, then threw
   * "useActionState is not a function" the moment the page rendered. Worth
   * recording, because it is a case a green build genuinely cannot catch.
   */
  const [state, setState] = useState<CheckInFormState>(INITIAL);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "asking" | "denied" | "unsupported">("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    try {
      const result = await createCheckIn(INITIAL, new FormData(form));
      setState(result);
      // Only clear on success, so a rejected submission keeps what was typed.
      if (result.ok) {
        form.reset();
        setCoords(null);
      }
    } catch {
      setState({ error: "Could not save that. Try again." });
    } finally {
      setPending(false);
    }
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("unsupported");
      return;
    }
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoState("idle");
      },
      // A refusal is a valid answer, not an error to retry: the check-in still
      // saves, it just will not be pinned.
      () => setGeoState("denied"),
      { timeout: 10_000 },
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="placeName"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Place
        </label>
        <input
          id="placeName"
          name="placeName"
          required
          maxLength={120}
          placeholder="Where are you eating?"
          className="rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-ink-hi placeholder:text-ink-lo focus:border-accent-green focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="plannedFor"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Planned for <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="plannedFor"
          name="plannedFor"
          type="datetime-local"
          className="rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-ink-hi focus:border-accent-green focus:outline-none"
        />
      </div>

      {coords ? <input type="hidden" name="lat" value={coords.lat} /> : null}
      {coords ? <input type="hidden" name="lon" value={coords.lon} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={requestLocation}
          disabled={geoState === "asking"}
          className="rounded-md border border-base-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo transition hover:border-accent-green hover:text-accent-green disabled:opacity-50"
        >
          {geoState === "asking" ? "Locating…" : coords ? "Location attached" : "Use my location"}
        </button>
        {coords ? (
          <span className="font-mono text-[10px] text-accent-green">
            {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
          </span>
        ) : null}
        {geoState === "denied" ? (
          <span className="font-mono text-[10px] text-ink-lo">
            Location declined — saves without a pin
          </span>
        ) : null}
        {geoState === "unsupported" ? (
          <span className="font-mono text-[10px] text-ink-lo">
            This browser has no location support
          </span>
        ) : null}
      </div>

      <label className="flex items-start gap-2 rounded-md border border-base-700 bg-base-900 px-3 py-2">
        <input
          type="checkbox"
          name="share"
          className="mt-0.5 h-3.5 w-3.5 accent-accent-green"
        />
        <span className="text-xs leading-relaxed text-ink-lo">
          Show this to accepted friends.
          <span className="block text-[11px] text-ink-lo/70">
            They see the place and time only — never what you ate.
          </span>
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-xs text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent-green px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-base-950 transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add check-in"}
      </button>
    </form>
  );
}
