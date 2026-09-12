"use client";

/**
 * The confirm step. Nothing reaches the database until a person has looked at
 * these numbers.
 *
 * Every figure is rendered as an editable input rather than as text. That is the
 * whole design: a number you can type over reads as an estimate, while the same
 * number set in prose reads as a measurement. The model's guess is a starting
 * point, not a result.
 */

import { useState } from "react";

import type { RecognitionResult } from "@/lib/food/recognize";

const MACROS = [
  { key: "kcal", label: "kcal", max: 2500 },
  { key: "proteinG", label: "protein g", max: 250 },
  { key: "carbG", label: "carbs g", max: 400 },
  { key: "fatG", label: "fat g", max: 200 },
] as const;

type MacroKey = (typeof MACROS)[number]["key"];
type Draft = { description: string } & Record<MacroKey, string>;

const CONFIDENCE_COPY: Record<"high" | "medium" | "low", string> = {
  high: "Clear read on the dish and the portion.",
  medium: "Dish is clear; the portion is a guess.",
  low: "Hard to read — check these before logging.",
};

function draftFrom(recognition: RecognitionResult): Draft {
  if (recognition.kind !== "recognized") {
    return { description: "", kcal: "", proteinG: "", carbG: "", fatG: "" };
  }
  const names = recognition.items.map((i) => i.name).join(", ");
  const portion = recognition.items.length === 1 ? ` (${recognition.items[0].portion})` : "";
  return {
    description: `${names}${portion}`,
    kcal: String(recognition.totals.kcal),
    proteinG: String(recognition.totals.protein),
    carbG: String(recognition.totals.carbs),
    fatG: String(recognition.totals.fat),
  };
}

/**
 * What to say about the meal's timestamp.
 *
 * Mirrors the server's rules in app/api/meals/route.ts deliberately: if the two
 * disagree the UI would describe a decision the database did not make. The
 * server remains the authority — this only predicts, and every branch names the
 * clock it is describing rather than stating a bare time.
 */
function describeTime(capturedAt: string | null | undefined): { text: string } {
  const now = new Date();
  const fallback = {
    text: `Will be logged at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — this photo carried no capture time, so that is when you uploaded it, not necessarily when you ate.`,
  };

  if (!capturedAt) return fallback;

  // Read the naive wall clock in the browser's own zone, which is the same
  // assumption the server makes.
  const m = capturedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return fallback;
  const shot = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (shot.getTime() > now.getTime() || now.getTime() - shot.getTime() > THIRTY_DAYS_MS) {
    // Same rejection the server applies, so the copy cannot promise a time the
    // insert will not use.
    return {
      text: `Will be logged at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — the photo says it was taken ${shot.toLocaleDateString()}, which is too far off to trust, so upload time is used instead.`,
    };
  }

  const clock = shot.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = shot.toDateString() === now.toDateString();

  if (sameDay) {
    return { text: `Taken at ${clock}, from the photo. That is when this meal will be logged.` };
  }

  // A backdated meal will not appear in "today", so say so outright rather than
  // let it save and seem to vanish.
  return {
    text: `Taken ${shot.toLocaleDateString()} at ${clock}, from the photo — so it will be logged on that day, not today.`,
  };
}

export function MealConfirm({
  recognition,
  photoPathname,
  capturedAt,
  onLogged,
}: {
  recognition: RecognitionResult;
  photoPathname?: string;
  /**
   * The photo's EXIF capture time as a naive wall clock ("YYYY-MM-DDTHH:MM"),
   * or null when the photo carried none.
   *
   * Passed in rather than derived, so this component never asserts a meal time
   * it was not given — the recurring bug in this codebase is a component
   * stating a fact it does not actually receive.
   */
  capturedAt?: string | null;
  onLogged: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(recognition));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognized = recognition.kind === "recognized" ? recognition : null;

  // Computed once per render rather than memoised: it reads the wall clock, and
  // a stale cached "will be logged at 14:02" would be its own small lie.
  const timeNote = describeTime(capturedAt);

  // A meal with no name and no calories is not a meal. Everything else is the
  // user's call — including a deliberate zero.
  const ready = draft.description.trim().length > 0 && draft.kcal.trim().length > 0;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: draft.description.trim(),
          kcal: Number(draft.kcal) || 0,
          proteinG: Number(draft.proteinG) || 0,
          carbG: Number(draft.carbG) || 0,
          fatG: Number(draft.fatG) || 0,
          // The stored confidence describes what the user accepted. Typing your
          // own numbers over a guess is not the same as a model being sure, so
          // an edited estimate is never promoted above MEDIUM.
          confidence: recognized ? recognized.confidence.toUpperCase() : "MEDIUM",
          source: photoPathname ? "photo" : "manual",
          photoPathname,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          /*
            Sent so the meal is filed at the time it was eaten rather than the
            time it was uploaded. The server still validates it and falls back
            to now if it is in the future or very old.
          */
          capturedAt: capturedAt ?? undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "That meal could not be saved.");
        return;
      }
      onLogged();
    } catch {
      setError("Saving failed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-base-700 bg-base-900 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          {recognized ? "Estimate — check it" : "Add it yourself"}
        </h3>
        {recognized ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-green">
            {recognized.confidence}
          </span>
        ) : null}
      </div>

      {/* State the limits of the estimate before the numbers, not after. */}
      {recognized ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-lo">
          {CONFIDENCE_COPY[recognized.confidence]}
          {recognized.caveat ? ` ${recognized.caveat}` : ""}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-lo">
          {recognition.kind === "not-food"
            ? "That doesn't look like food, so nothing was estimated. You can still log a meal by hand."
            : recognition.kind === "implausible"
              ? `${recognition.reason} Type what you think it was instead.`
              : "The estimator is unavailable right now, so nothing was guessed. Your photo is saved — fill in what you know."}
        </p>
      )}

      {/*
        When the meal is being filed, and on whose authority.

        This exists because the previous behaviour was wrong and invisible: the
        meal took the *upload* time, so reviewing brunch photos at night logged
        everything at midnight with nothing on screen to reveal it. A time this
        app acts on has to be stated, and its source named, exactly like the
        MEASURED/ASSUMED distinction on planner decisions.
      */}
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-lo">
        {timeNote.text}
      </p>

      <label className="mt-3 block">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">Meal</span>
        <input
          type="text"
          value={draft.description}
          maxLength={200}
          placeholder="e.g. boat noodles, one bowl"
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className="mt-1 min-h-[40px] w-full rounded-lg border border-base-600 bg-base-850 px-2.5 text-[14px] text-ink-hi placeholder:text-ink-lo focus:border-accent-green focus:outline-none"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {MACROS.map(({ key, label, max }) => (
          <label key={key} className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">{label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              value={draft[key]}
              placeholder="0"
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              className="mt-1 min-h-[40px] w-full rounded-lg border border-base-600 bg-base-850 px-2.5 font-mono text-[14px] text-ink-hi placeholder:text-ink-lo focus:border-accent-green focus:outline-none"
            />
          </label>
        ))}
      </div>

      {/* Deliberately not accent-red: the palette reserves that for the
          medical safety card, and a save failure must not compete with it. */}
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-base-600 bg-base-900 p-2.5 text-[12px] leading-relaxed text-ink-mid"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!ready || saving}
        onClick={() => void submit()}
        className="mt-3 min-h-[44px] w-full rounded-lg bg-accent-green text-[14px] font-semibold text-base-950 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Log this meal"}
      </button>
    </div>
  );
}
