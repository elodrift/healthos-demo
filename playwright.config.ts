import { defineConfig, devices } from "@playwright/test";

/**
 * The caption suite runs against a dev server, so it is deliberately NOT part of
 * `npm run verify`.
 *
 * `verify`'s CI job runs offline tests only — no Neon, no WHOOP, no Open Food
 * Facts — and a browser suite needs a running Next server. Folding it into
 * `verify` would either slow the required check by a minute of server boot or,
 * worse, make a red build ambiguous between "a caption regressed" and "the
 * sandbox could not start a server". It runs as `npm run test:captions`.
 *
 * `verify:build` is also poison next to this: a production build overwrites the
 * dev server's `.next` chunks and the next request dies with "Cannot find module
 * './948.js'". Run captions against `next dev`, not around a build.
 */
export default defineConfig({
  testDir: "./tests/captions",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : [["list"]],

  use: {
    baseURL: process.env.CAPTION_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    // 390px is the width the mobile layout is designed against.
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /*
    Reuses an already-running dev server when there is one. In this sandbox the
    preview server is always up on 3000; booting a second one would fight it for
    the same `.next` directory.
  */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/dev/caption-harness",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
