"use client";

// Three quick picks, then a payoff card. Skippable at every step: the visitor
// must be able to reach the first chat beat immediately.

import { motion } from "framer-motion";
import { usePlayerStore } from "@/lib/store";
import {
  goalLabel,
  goalModes,
  personaById,
  personas,
} from "@/lib/fixtures/personas";

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === step ? "w-5 bg-accent-green" : "w-1.5 bg-base-600"
          }`}
        />
      ))}
    </div>
  );
}

function PickCard({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
        selected
          ? "border-accent-green bg-accent-green/10 shadow-glow"
          : "border-base-700 bg-base-850 hover:border-base-500"
      }`}
    >
      <div className="text-[15px] font-semibold text-ink-hi">{label}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-ink-mid">{detail}</div>
    </button>
  );
}

export function QuickSetup() {
  const step = usePlayerStore((s) => s.setupStep);
  const setStep = usePlayerStore((s) => s.setSetupStep);
  const personaId = usePlayerStore((s) => s.personaId);
  const setPersona = usePlayerStore((s) => s.setPersona);
  const mode = usePlayerStore((s) => s.mode);
  const setMode = usePlayerStore((s) => s.setMode);
  const startDay = usePlayerStore((s) => s.startDay);

  const targets = personaById(personaId).baselineTargets;

  const provenanceRows: Array<{ label: string; value: string; tag: string }> = [
    { label: "Protein", value: `${targets.protein_g}g`, tag: targets.provenance.protein_g },
    { label: "Kcal", value: `${targets.kcal.toLocaleString()}`, tag: targets.provenance.kcal },
    { label: "Carbs", value: `${targets.carbs_g}g`, tag: targets.provenance.carbs_g },
    { label: "Fat", value: `≤ ${targets.fat_max_g}g`, tag: targets.provenance.fat_max_g },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
      <div className="flex items-center justify-between">
        <StepDots step={step} />
        <button
          type="button"
          onClick={startDay}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo transition hover:text-accent-green"
        >
          Skip setup →
        </button>
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="mt-6 flex flex-1 flex-col"
      >
        {step === 0 ? (
          <>
            <h2 className="text-[22px] font-semibold leading-tight text-ink-hi">Who is today for?</h2>
            <p className="mt-1.5 text-[13px] text-ink-mid">Pick a starting body and bloodwork.</p>
            <div className="mt-5 flex flex-col gap-3">
              {personas.map((p) => (
                <PickCard
                  key={p.id}
                  label={p.label}
                  detail={p.detail}
                  selected={personaId === p.id}
                  onClick={() => {
                    setPersona(p.id);
                    setStep(1);
                  }}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h2 className="text-[22px] font-semibold leading-tight text-ink-hi">Goal and timeframe</h2>
            <p className="mt-1.5 text-[13px] text-ink-mid">Fixed for the demo — one clear objective.</p>
            <div className="mt-5 rounded-2xl border border-accent-green/40 bg-base-850 px-4 py-5">
              <div className="text-[17px] font-semibold text-ink-hi">{goalLabel}</div>
              <div className="mt-4 h-1.5 rounded-full bg-base-700">
                <div className="h-full w-[38%] rounded-full bg-accent-green" />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] tabular-nums text-ink-lo">
                <span>week 6</span>
                <span>week 16</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-5 w-full rounded-full bg-accent-green px-5 py-3.5 text-[15px] font-semibold text-base-950 transition hover:brightness-110"
            >
              Continue
            </button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="text-[22px] font-semibold leading-tight text-ink-hi">How hard should it push?</h2>
            <p className="mt-1.5 text-[13px] text-ink-mid">
              Watch how differently your day plays out.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {goalModes.map((m) => (
                <PickCard
                  key={m.id}
                  label={m.label}
                  detail={m.detail}
                  selected={mode === m.id}
                  onClick={() => {
                    setMode(m.id);
                    setStep(3);
                  }}
                />
              ))}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2 className="text-[22px] font-semibold leading-tight text-ink-hi">
              Your baseline → today&apos;s plan
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-mid">
              Every number carries where it came from.
            </p>
            <div className="mt-5 overflow-hidden rounded-2xl border border-base-700 bg-base-850">
              {provenanceRows.map((row, i) => (
                <motion.div
                  key={row.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="flex items-center justify-between gap-3 border-b border-base-700 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink-mid">{row.label}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-ink-lo">{row.tag}</div>
                  </div>
                  <div className="shrink-0 text-2xl font-semibold tabular-nums text-accent-green">
                    {row.value}
                  </div>
                </motion.div>
              ))}
            </div>
            <button
              type="button"
              onClick={startDay}
              className="mt-5 w-full rounded-full bg-accent-green px-5 py-3.5 text-[15px] font-semibold text-base-950 transition hover:brightness-110"
            >
              Start the day
            </button>
          </>
        ) : null}
      </motion.div>
    </div>
  );
}
