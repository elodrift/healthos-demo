import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  baselineDocument,
  onboardingProfile,
  wearableConnection,
} from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Setup — HealthOS",
  description: "Connect a wearable and set your goal contract.",
};

export const dynamic = "force-dynamic";

/** The stored enum is a policy switch; users should never see its raw form. */
const GOAL_MODE_LABELS: Record<string, string> = {
  STRICT_HEALTHY: "Strict but healthy",
  FAST_AGGRESSIVE: "Fast and aggressive",
};

/**
 * Onboarding hub (DNA §6).
 *
 * §116 defines "complete" behaviourally: onboarding is done when the engine can
 * answer "what is today's plan?". Step state here is read from the database
 * rather than a client step counter, so a half-finished setup resumes correctly
 * after a reload or on another device.
 */
export default async function OnboardingPage() {
  // Next 14.2: headers() is synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in");

  const userId = session.user.id;

  const [connRows, profileRows, docRows] = await Promise.all([
    db
      .select()
      .from(wearableConnection)
      .where(
        and(
          eq(wearableConnection.userId, userId),
          eq(wearableConnection.provider, "whoop"),
        ),
      )
      .limit(1),
    db
      .select()
      .from(onboardingProfile)
      .where(eq(onboardingProfile.userId, userId))
      .limit(1),
    db
      .select({ id: baselineDocument.id })
      .from(baselineDocument)
      .where(eq(baselineDocument.userId, userId))
      .limit(1),
  ]);

  const conn = connRows[0];
  const profile = profileRows[0];

  const steps = [
    {
      title: "Connect a wearable",
      detail: conn
        ? "WHOOP connected."
        : "WHOOP reads your sleep and recovery to propose meal timing.",
      done: Boolean(conn),
      href: "/connect/whoop",
      cta: conn ? "Manage" : "Connect WHOOP",
    },
    {
      title: "Set your goal contract",
      detail: profile?.objective
        ? `${profile.objective}${
            profile.goalMode ? ` · ${GOAL_MODE_LABELS[profile.goalMode] ?? profile.goalMode}` : ""
          }`
        : "What you're optimising for, by when, and how aggressively.",
      done: Boolean(profile?.objective && profile?.goalMode),
      href: "/onboarding/goal",
      cta: profile?.objective ? "Edit" : "Set goal",
    },
    {
      title: "Add a baseline",
      detail: docRows[0]
        ? "Baseline document uploaded."
        : "Bloodwork or body composition. Optional, and upload isn't built yet.",
      done: Boolean(docRows[0]),
      // Deliberately null: the upload route does not exist, and a button that
      // leads to a 404 is worse than one that says so (§4.11).
      href: null as string | null,
      cta: "Not built yet",
    },
  ];

  const remaining = steps.filter((s) => !s.done && s.title !== "Add a baseline");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[11px] font-bold text-accent-green"
        >
          OS
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink-hi">
          HealthOS
        </span>
      </Link>

      <h1 className="text-pretty text-[26px] font-semibold leading-[1.15] tracking-tight text-ink-hi">
        Set up Live mode
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-mid">
        {remaining.length === 0
          ? "Setup is complete. Live mode can build today's plan."
          : remaining.length === 1
            ? "One step left before the engine can plan a real day."
            : "Two steps before the engine can plan a real day."}
      </p>

      <ol className="mt-7 flex flex-col gap-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="rounded-xl border border-base-700 bg-base-850 p-4"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold " +
                  (step.done
                    ? "bg-accent-green text-base-950"
                    : "border border-base-600 text-ink-lo")
                }
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-medium leading-snug text-ink-hi">
                  {step.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-mid">
                  {step.detail}
                </p>
                {step.href ? (
                  <Link
                    href={step.href}
                    className="mt-2.5 inline-flex min-h-[36px] items-center rounded-lg border border-base-600 px-3 text-[13px] font-medium text-ink-hi"
                  >
                    {step.cta}
                  </Link>
                ) : (
                  <span className="mt-2.5 inline-flex min-h-[36px] items-center rounded-lg border border-dashed border-base-700 px-3 text-[13px] font-medium text-ink-lo">
                    {step.cta}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-col gap-2 border-t border-base-800 pt-5">
        <p className="text-[12px] leading-relaxed text-ink-lo">
          Signed in as {session.user.email}
        </p>
        <Link
          href="/live"
          className="text-[13px] font-medium text-accent-green underline decoration-accent-green/40 underline-offset-2"
        >
          Open today&apos;s plan
        </Link>
      </div>
    </main>
  );
}
