import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-[85vh] flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/15 text-2xl text-accent-green">
          ♥
        </div>
        <h1 className="max-w-xl text-2xl font-semibold leading-snug text-ink-hi sm:text-3xl">
          HealthOS re-plans your day the moment life changes it.
        </h1>
        <p className="max-w-md text-sm text-ink-mid">
          Live one disrupted Saturday — a boat trip nobody planned meals around — and watch the
          plan adapt in real time.
        </p>
      </div>
      <Link
        href="/day"
        className="rounded-full bg-accent-green px-8 py-3 text-sm font-semibold text-base-950 transition hover:opacity-90"
      >
        Start the demo
      </Link>
      <p className="text-[11px] text-ink-lo">Simulated demo — not medical advice.</p>
    </main>
  );
}
