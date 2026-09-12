import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogPanel } from "@/components/photo/log-panel";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Log a meal",
  description: "Add a photo of what you ate. Location data is removed before the photo is stored.",
};

// Removed for cacheComponents compatibility

export default async function LogPage() {
  const session = await await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in?next=/log");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo">Log</p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-ink-hi text-balance">
          What did you eat?
        </h1>
      </header>

      {/*
        The "macro estimation is not built yet" panel that used to sit here has
        been removed because it is no longer true — a vision model now estimates
        the photo and the user confirms it before anything is stored.
      */}
      <LogPanel />

      <Link
        href="/live"
        className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-base-600 px-3 text-[13px] font-medium text-ink-hi"
      >
        Back to today
      </Link>
    </main>
  );
}
