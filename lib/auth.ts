import { betterAuth } from "better-auth";
import { pool } from "@/lib/db";

/**
 * Better Auth server config. Email + password only, per the stack default.
 *
 * The secret is read from BETTER_AUTH_SECRET. In local development a value is
 * generated into .env.local (gitignored) so the flow can actually be built and
 * tested; production must supply a real one through the Vercel project env
 * vars. We fail loudly rather than fall back, because a missing secret in
 * production means every session cookie is unverifiable.
 */
const secret = process.env.BETTER_AUTH_SECRET;

if (!secret && process.env.NODE_ENV === "production") {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Add it to the Vercel project environment " +
      "variables (generate with: openssl rand -base64 32). Sessions cannot be " +
      "signed without it.",
  );
}

export const auth = betterAuth({
  database: pool,
  secret,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    // Better Auth rejects with "Invalid origin" for anything not listed here.
    // In the v0 sandbox the browser reaches the app through a rotating proxy
    // host (https://sb-<id>.vercel.run) — NOT localhost, which is what the
    // dev server binds to. Measured from the actual rejection, not assumed.
    // Wildcards are supported (see better-auth/dist/auth/trusted-origins),
    // so these patterns cover the proxy without trusting arbitrary origins.
    // Development only: production uses the explicit URLs below.
    ...(process.env.NODE_ENV === "development"
      ? [
          "https://*.vercel.run",
          "https://*.v0.build",
          `http://localhost:${process.env.PORT ?? 3000}`,
        ]
      : []),
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // The v0 preview renders the app in a cross-site iframe. Without
          // these attributes the browser silently drops the session cookie
          // and the user looks permanently logged out.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
});
