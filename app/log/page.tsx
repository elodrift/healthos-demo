import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MealPhotoUpload } from "@/components/photo/meal-photo-upload";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Log a meal",
  description: "Add a photo of what you ate. Location data is removed before the photo is stored.",
};

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo">Log</p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-ink-hi text-balance">
          What did you eat?
        </h1>
      </header>

      <MealPhotoUpload />

      {/*
        Stated plainly rather than implied by a disabled-looking control: the
        photo is stored and scrubbed, but nothing estimates macros from it yet,
        so no number is shown. §4.11 forbids implying precision we don't have.
      */}
      <section className="rounded-2xl border border-dashed border-base-700 p-4">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink-mid">Macro estimation</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-lo">
          Not built yet. The photo is stored and scrubbed of location data, but nothing reads protein
          from it, so no estimate is shown rather than a guess.
        </p>
      </section>

      <Link
        href="/live"
        className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-base-600 px-3 text-[13px] font-medium text-ink-hi"
      >
        Back to today
      </Link>
    </main>
  );
}
