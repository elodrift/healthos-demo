import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatMessage } from "@/lib/db/schema";
import { ChatThread } from "@/components/chat/chat-thread";

export const metadata: Metadata = {
  title: "Chat — HealthOS",
  description: "Talk to the engine. It answers from your own logged data, or says it cannot.",
};

/** Per-user rows and a live transcript; never cache this. */
export const dynamic = "force-dynamic";

/**
 * The chat surface, restored.
 *
 * A chat existed here before and was deleted along with the scripted demo,
 * because it replayed a 669-line fixture narrative next to real output. This one
 * has no script: every turn goes through the deterministic matcher, and any
 * figure it quotes comes from the user's own `meal_log` rows and today's planner
 * proposal.
 *
 * DNA §7 rules that the product is "dark, chat-first, engine-visible" and
 * explicitly rejects "wizard-replaces-chat", so this is the canonical shape
 * rather than an addition to it.
 */
export default async function ChatPage() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in?next=/chat");

  const history = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.userId, session.user.id))
    .orderBy(asc(chatMessage.createdAt))
    .limit(100);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-xl flex-col gap-5 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[11px] font-bold text-accent-green"
          >
            OS
          </span>
          <span className="text-[15px] font-semibold tracking-tight">HealthOS</span>
        </Link>
        <Link
          href="/live"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo underline underline-offset-4"
        >
          Today
        </Link>
      </header>

      <ChatThread
        initialTurns={history.map((row) => ({
          id: row.id,
          role: row.role,
          text: row.text,
          source: row.source,
        }))}
      />
    </main>
  );
}
