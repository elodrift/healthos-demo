import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import GoalForm from "@/components/goal-form";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { onboardingProfile } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Your goal — HealthOS",
  description: "Set the goal contract that drives daily orchestration.",
};

export const dynamic = "force-dynamic";

export default async function GoalPage() {
  // Next 14.2: headers() is synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in");

  const rows = await db
    .select()
    .from(onboardingProfile)
    .where(eq(onboardingProfile.userId, session.user.id))
    .limit(1);

  const p = rows[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
      <Link
        href="/onboarding"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-lo"
      >
        <span aria-hidden="true">←</span> Setup
      </Link>

      <h1 className="text-pretty text-[26px] font-semibold leading-[1.15] tracking-tight text-ink-hi">
        Your goal
      </h1>
      <p className="mt-2 mb-7 text-[14px] leading-relaxed text-ink-mid">
        This is a contract, not a label. It changes how the engine plans each
        day, so it can be argued with later.
      </p>

      <GoalForm
        initial={{
          objective: p?.objective ?? "",
          goalMode: p?.goalMode ?? "",
          controlLevel: p?.controlLevel ?? "",
          targetDate: p?.targetDate ?? "",
        }}
      />
    </main>
  );
}
