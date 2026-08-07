import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

const strip = [
  {
    title: "Biomarker-aware",
    body: "Your protein floor comes from your lipid panel, not a calculator. Every target shows where it came from.",
  },
  {
    title: "Adapts all day",
    body: "Skipped session, unplanned restaurant, schedule chaos — targets revise the moment the day changes.",
  },
  {
    title: "Every decision explained",
    body: "A deterministic engine logs each decision with its cause. You can read the reasoning, event by event.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-10 pt-8 lg:px-8">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[11px] font-bold text-accent-green"
            >
              OS
            </span>
            <span className="text-[15px] font-semibold tracking-tight">HealthOS</span>
          </span>
          <a
            href="#how-it-decides"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo transition hover:text-accent-green"
          >
            How it decides
          </a>
        </header>

        <section className="flex flex-1 flex-col justify-center py-14">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-green">
            Built on your own data
          </span>
          <h1 className="mt-4 max-w-2xl text-pretty text-[34px] font-semibold leading-[1.1] tracking-tight text-ink-hi sm:text-5xl">
            Your health, orchestrated. All day. Every day.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-mid sm:text-base">
            HealthOS adapts your nutrition and training the moment life changes — grounded in your
            bloodwork, honest about uncertainty.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/sign-in"
              className="rounded-full bg-accent-green px-7 py-3.5 text-[15px] font-semibold text-base-950 transition hover:brightness-110"
            >
              Get started
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo">
              Connect WHOOP · your data stays yours
            </span>
          </div>
        </section>

        <section id="how-it-decides" className="scroll-mt-8 pb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {strip.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-base-700 bg-base-850 px-4 py-5 shadow-card"
              >
                <h2 className="text-[15px] font-semibold text-ink-hi">{card.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">{card.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
      <Disclaimer />
    </main>
  );
}
