/**
 * Verification for whoopRedirectUri() in lib/whoop/client.ts.
 *
 * This exists because of a real setup failure. WHOOP's dashboard asks for the
 * complete redirect URI, so that whole string is what the person configuring the
 * app has in front of them — and pasting it into WHOOP_REDIRECT_BASE_URL yielded
 * ".../api/whoop/callback/api/whoop/callback". WHOOP rejects that as a
 * redirect_uri mismatch, an error message that points nowhere near the cause.
 *
 * The invariant asserted here is the one that matters: whatever spelling of the
 * base URL is supplied, the function must emit exactly one callback path, and it
 * must equal the URI registered with WHOOP. Character-for-character equality is
 * the whole requirement, so this asserts the output string rather than internals.
 *
 * Run with: npm run test:whoop
 */

import { whoopRedirectUri } from "../lib/whoop/client";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  pass  ${label}`);
  } else {
    failures++;
    console.log(
      `  FAIL  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`,
    );
  }
}

const EXPECTED = "https://healthos-demo-chi.vercel.app/api/whoop/callback";
const ORIGIN = "https://healthos-demo-chi.vercel.app";

/** Run with a specific WHOOP_REDIRECT_BASE_URL, restoring the env afterwards. */
function withBase(value: string | undefined): string {
  const prevBase = process.env.WHOOP_REDIRECT_BASE_URL;
  // Cleared so the fallback chain cannot mask what is being tested.
  const prevProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const prevVercel = process.env.VERCEL_URL;
  const prevRuntime = process.env.V0_RUNTIME_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
  delete process.env.V0_RUNTIME_URL;

  if (value === undefined) delete process.env.WHOOP_REDIRECT_BASE_URL;
  else process.env.WHOOP_REDIRECT_BASE_URL = value;

  try {
    return whoopRedirectUri();
  } finally {
    if (prevBase === undefined) delete process.env.WHOOP_REDIRECT_BASE_URL;
    else process.env.WHOOP_REDIRECT_BASE_URL = prevBase;
    if (prevProd !== undefined) process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProd;
    if (prevVercel !== undefined) process.env.VERCEL_URL = prevVercel;
    if (prevRuntime !== undefined) process.env.V0_RUNTIME_URL = prevRuntime;
  }
}

console.log("whoopRedirectUri()");

// The correct spelling.
check("plain origin", withBase(ORIGIN) === EXPECTED, withBase(ORIGIN));

// The mistake that actually occurred.
check(
  "full callback URL is not doubled",
  withBase(EXPECTED) === EXPECTED,
  withBase(EXPECTED),
);

// Trailing slashes, in both positions.
check("trailing slash", withBase(`${ORIGIN}/`) === EXPECTED, withBase(`${ORIGIN}/`));
check(
  "callback URL with trailing slash",
  withBase(`${EXPECTED}/`) === EXPECTED,
  withBase(`${EXPECTED}/`),
);

// Scheme omitted: https is assumed rather than producing a relative URI.
check(
  "bare host gains https",
  withBase("healthos-demo-chi.vercel.app") === EXPECTED,
  withBase("healthos-demo-chi.vercel.app"),
);

// Exactly one occurrence of the path, in every case above.
for (const input of [ORIGIN, EXPECTED, `${ORIGIN}/`, `${EXPECTED}/`]) {
  const out = withBase(input);
  const count = out.split("/api/whoop/callback").length - 1;
  check(`single callback path for ${JSON.stringify(input)}`, count === 1, out);
}

// A missing base must fail loudly, not emit a relative or malformed URI that
// WHOOP would reject with an unrelated-looking error.
let threw = false;
try {
  withBase(undefined);
} catch {
  threw = true;
}
check("throws when nothing is resolvable", threw);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
