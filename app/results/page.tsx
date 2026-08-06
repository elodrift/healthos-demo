"use client";

import Link from "next/link";
import { usePlayerStore } from "@/lib/store";
import { goalModeBadge, personaById } from "@/lib/fixtures/personas";
import { DemoFooter } from "@/components/DemoFooter";
import { AdherenceRing } from "@/components/results/AdherenceRing";
import { WeightTrend } from "@/components/results/WeightTrend";

export default function ResultsPage() {
  const personaId = usePlayerStore((s) => s.personaId);
  const mode = usePlayerStore((s) => s.mode);
  const resetAll = usePlayerStore((s) => s.resetAll);
  const persona = personaById(personaId);

  const fast = mode === "fast";
  const adherence = fast ? 79 : 86;
  const weightDelta = fast ? -3.1 : -2.2;
  const series = fast
    ? [84.2, 83.9, 83.1, 82.4, 81.1]
    : [84.2, 84.0, 83.5, 83.0, 82.0];

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 pb-10 pt-8 lg:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            HealthOS
          </Link>
          <span className="rounded-full border border-base-600 px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-mid">
            {goalModeBadge[mode]}
          </span>
        </header>

        <section className="pt-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-green">
            4 weeks later
          </span>
          <h1 className="mt-3 max-w-xl text-pretty text-[30px] font-semibold leading-[1.12] tracking-tight text-ink-hi sm:text-4xl">
            Results are what make structure worth it.
          </h1>
          <p className="mt-3 text-[13px] text-ink-mid">
            {persona.label} · simulated trend for this run.
          </p>
        </section>

        <section className="mt-8 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-base-700 bg-base-850 p-4 shadow-card lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo">
                Weight
              </span>
              <span className="text-2xl font-semibold tabular-nums text-accent-green">
                {weightDelta} kg
              </span>
            </div>
            <WeightTrend series={series} />
            <div className="mt-2 flex justify-between font-mono text-[10px] tabular-nums text-ink-lo">
              <span>week 0</span>
              <span>week 4</span>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-base-700 bg-base-850 p-4 shadow-card">
            <AdherenceRing value={adherence} />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo">
                Adherence
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                {fast
                  ? "Aggressive mode asks more of you — and it shows in the number."
                  : "Sustainable pace, held without heroics."}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-accent-green/35 bg-base-850 p-4 shadow-card">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent-green">
            Biomarker
          </span>
          <p className="mt-2 text-[17px] font-semibold text-ink-hi">
            LDL: trending down — next panel September
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">
            The protein floor and fat ceiling that never moved during the day are the reason this
            line moves at all.
          </p>
        </section>

        <section className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="mailto:waitlist@healthos.demo?subject=HealthOS%20waitlist"
            className="rounded-full bg-accent-green px-7 py-3.5 text-center text-[15px] font-semibold text-base-950 transition hover:brightness-110"
          >
            Join the waitlist
          </a>
          <Link
            href="/day"
            onClick={resetAll}
            className="rounded-full border border-base-600 px-7 py-3.5 text-center text-[15px] font-medium text-ink-mid transition hover:border-accent-green/60 hover:text-accent-green"
          >
            Replay the day
          </Link>
        </section>
      </div>
      <DemoFooter />
    </main>
  );
}
