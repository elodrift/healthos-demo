/**
 * Environment contract.
 *
 * Every variable the app needs, in one place, validated once. The problem this
 * solves is specific: without it, a variable missing on Vercel does not fail the
 * deploy — it fails on the first request that happens to need it, in production,
 * as a 500 with a driver-level message. `DATABASE_URL` was the live example:
 * `new Pool({ connectionString: undefined })` constructs fine and only throws
 * when a query runs.
 *
 * Deliberately not thrown at build time. `next build` runs with
 * NODE_ENV=production but without the runtime environment, so validating there
 * would fail every build for the wrong reason. The check runs at first import in
 * a running production server, which is the moment the values actually exist.
 */

import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Neon connection string)."),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 chars (openssl rand -base64 32)."),

  /** Stable public origin. Required in production so redirects cannot be steered by a request header. */
  BETTER_AUTH_URL: z.string().url().optional(),

  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),

  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof Schema>;

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isProd = process.env.NODE_ENV === "production";

function load(): Env {
  const parsed = Schema.safeParse(process.env);

  if (parsed.success) return parsed.data;

  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

  if (isProd && !isBuild) {
    throw new Error(
      `Environment is not valid. The app will not start.\n${detail}\n\n` +
        "Set these in the Vercel project settings, then redeploy.",
    );
  }

  // Development and build: warn once, keep going. A developer without WHOOP
  // credentials should still be able to run the meal-logging half of the app.
  if (!isBuild) {
    console.warn(`[env] Continuing with an incomplete environment:\n${detail}`);
  }
  return process.env as unknown as Env;
}

export const env: Env = load();

/**
 * The origin this deployment answers on.
 *
 * Never derived from a request header. `Host` and `X-Forwarded-Host` are
 * attacker-controlled on any path that is not strictly proxied, and using them
 * to build a redirect target is an open redirect — which, in an OAuth callback,
 * is a credential-forwarding bug rather than a cosmetic one.
 */
export function publicOrigin(): string {
  const explicit = process.env.BETTER_AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.V0_RUNTIME_URL) return process.env.V0_RUNTIME_URL.replace(/\/$/, "");
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
