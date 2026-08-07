"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveGoalContract } from "@/app/actions/onboarding";

type Props = {
  initial: {
    objective: string;
    goalMode: string;
    controlLevel: string;
    targetDate: string;
    proteinTargetG: string;
    proteinFloorG: string;
  };
};

const GOAL_MODES = [
  {
    value: "STRICT_HEALTHY",
    label: "Strict but healthy",
    hint: "Never trade a marker for speed.",
  },
  {
    value: "FAST_AGGRESSIVE",
    label: "Fast and aggressive",
    hint: "Accept harder days to move faster.",
  },
];

const CONTROL_LEVELS = [
  { value: "FULL", label: "Full", hint: "I cook and choose almost everything." },
  { value: "PARTIAL", label: "Partial", hint: "Some meals are out of my hands." },
  { value: "MINIMAL", label: "Minimal", hint: "I eat what's available." },
];

/**
 * §6 Step 2. `controlLevel` is asked here rather than inferred because the
 * planner scales its precision to it — demanding gram-level input from someone
 * eating in a canteen is a design failure, not rigour.
 */
export default function GoalForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [goalMode, setGoalMode] = useState(initial.goalMode || "");
  const [controlLevel, setControlLevel] = useState(
    initial.controlLevel && initial.controlLevel !== "UNKNOWN"
      ? initial.controlLevel
      : "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await saveGoalContract({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/onboarding");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="objective"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo"
        >
          What are you optimising for
        </label>
        <textarea
          id="objective"
          name="objective"
          required
          rows={3}
          maxLength={500}
          defaultValue={initial.objective}
          placeholder="Drop body fat without losing strength, and fix my ferritin."
          className="w-full resize-none rounded-lg border border-base-700 bg-base-900 px-3 py-2.5 text-[15px] leading-relaxed text-ink-hi placeholder:text-ink-lo/60 outline-none transition-colors focus:border-accent-green/60"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          How hard to push
        </legend>
        {GOAL_MODES.map((m) => (
          <label
            key={m.value}
            className={
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
              (goalMode === m.value
                ? "border-accent-green/60 bg-accent-green/5"
                : "border-base-700 bg-base-900")
            }
          >
            <input
              type="radio"
              name="goalMode"
              value={m.value}
              checked={goalMode === m.value}
              onChange={() => setGoalMode(m.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-accent-green"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink-hi">
                {m.label}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-mid">
                {m.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          Control over your food
        </legend>
        {CONTROL_LEVELS.map((c) => (
          <label
            key={c.value}
            className={
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
              (controlLevel === c.value
                ? "border-accent-green/60 bg-accent-green/5"
                : "border-base-700 bg-base-900")
            }
          >
            <input
              type="radio"
              name="controlLevel"
              value={c.value}
              checked={controlLevel === c.value}
              onChange={() => setControlLevel(c.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-accent-green"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink-hi">
                {c.label}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-mid">
                {c.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/*
        Typed, not derived. The app could estimate protein from bodyweight, but
        that would make the number the app's inference presented as the user's
        commitment — and every target on /live is supposed to be traceable to
        something the user actually said. Blank stays blank.
      */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          Daily protein <span className="normal-case tracking-normal">(optional)</span>
        </legend>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="proteinTargetG" className="text-[13px] font-medium text-ink-hi">
            Target
          </label>
          <div className="flex items-center gap-2">
            <input
              id="proteinTargetG"
              name="proteinTargetG"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={initial.proteinTargetG}
              placeholder="160"
              aria-describedby="protein-hint"
              className="min-h-[44px] w-full rounded-lg border border-base-700 bg-base-900 px-3 text-[15px] text-ink-hi placeholder:text-ink-lo/60 outline-none transition-colors focus:border-accent-green/60"
            />
            <span className="font-mono text-[13px] text-ink-lo">g</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="proteinFloorG" className="text-[13px] font-medium text-ink-hi">
            Floor
          </label>
          <div className="flex items-center gap-2">
            <input
              id="proteinFloorG"
              name="proteinFloorG"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={initial.proteinFloorG}
              placeholder="120"
              aria-describedby="protein-hint"
              className="min-h-[44px] w-full rounded-lg border border-base-700 bg-base-900 px-3 text-[15px] text-ink-hi placeholder:text-ink-lo/60 outline-none transition-colors focus:border-accent-green/60"
            />
            <span className="font-mono text-[13px] text-ink-lo">g</span>
          </div>
        </div>

        <p id="protein-hint" className="text-[12px] leading-relaxed text-ink-mid">
          Leave these blank and the day shows a running total instead of progress — nothing is
          assumed on your behalf. The floor is what gets defended on days you don&apos;t control
          your food.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="targetDate"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo"
        >
          Target date <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="targetDate"
          name="targetDate"
          type="date"
          defaultValue={initial.targetDate}
          className="w-full rounded-lg border border-base-700 bg-base-900 px-3 py-2.5 text-[15px] text-ink-hi outline-none transition-colors focus:border-accent-green/60"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-[13px] leading-relaxed text-accent-red"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-accent-green px-4 text-[15px] font-semibold text-base-950 transition-opacity disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save goal"}
      </button>
    </form>
  );
}
