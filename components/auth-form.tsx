"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

/**
 * Shared email + password form for both sign-in and sign-up.
 *
 * Sized for the 302px preview first: single column, 44px targets, no
 * horizontal padding that would squeeze the inputs.
 */
export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Better Auth enforces this server-side too; checking here turns a failed
    // request into an inline message instead of a generic error.
    if (isSignUp && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setPending(true);
    try {
      const res = isSignUp
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });

      if (res.error) {
        setError(res.error.message ?? "Something went wrong. Try again.");
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-base-700 bg-base-900 px-3 py-2.5 text-[15px] text-ink-hi " +
    "placeholder:text-ink-lo/60 outline-none transition-colors focus:border-accent-green/60";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {isSignUp ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="name"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Patrick"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={isSignUp ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder={isSignUp ? "At least 8 characters" : "Your password"}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-[13px] leading-relaxed text-accent-red"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-accent-green px-4 text-[15px] font-semibold text-base-950 transition-opacity disabled:opacity-60"
      >
        {pending
          ? isSignUp
            ? "Creating account…"
            : "Signing in…"
          : isSignUp
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="text-center text-[13px] leading-relaxed text-ink-lo">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-accent-green underline decoration-accent-green/40 underline-offset-2"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </form>
  );
}
