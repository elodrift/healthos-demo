import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import AuthForm from "@/components/auth-form";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in — HealthOS",
  description: "Sign in to HealthOS Live mode.",
};

export default async function SignInPage() {
  // Next 14.2: headers() is synchronous, unlike Next 15/16.
  const session = await auth.api.getSession({ headers: headers() });
  if (session?.user) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
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
        Sign in
      </h1>
      <p className="mt-2 mb-7 text-[14px] leading-relaxed text-ink-mid">
        HealthOS reads your real WHOOP data, so it needs an account.
      </p>

      <AuthForm mode="sign-in" />
    </main>
  );
}
