#!/usr/bin/env node
/**
 * nextaudit — a dependency-free static auditor for Next.js App Router codebases.
 *
 * Built for repos where a meaningful share of the code was written by an AI agent
 * (v0, Claude Code, Cursor). It looks for the specific failure modes that class of
 * code exhibits: auth checks that were never wired up, unvalidated server action
 * input, unbounded external fetches, `any` creeping in, and client boundaries
 * pushed too high up the tree.
 *
 * Usage:
 *   node audit/audit.mjs                       # audit cwd, human-readable report
 *   node audit/audit.mjs --root ../app         # audit another directory
 *   node audit/audit.mjs --md audit-report.md  # also write a markdown report
 *   node audit/audit.mjs --json audit.json     # also write machine-readable JSON
 *   node audit/audit.mjs --fail-on high        # exit 1 if any high+ finding (CI)
 *   node audit/audit.mjs --only SEC            # only run rules in a category
 *   node audit/audit.mjs --ignore SEC001       # skip rules by id (comma-separated)
 *
 * `--ignore` exists for tracked exceptions: a finding that is true, known, and
 * scheduled — not one you disagree with. Every ignore should have an expiry
 * written next to it at the call site (a CI comment naming the PR that removes
 * it), otherwise it is not an exception, it is a disabled rule.
 *
 * Exit codes: 0 = clean at the chosen threshold, 1 = findings at/above threshold,
 * 2 = the auditor itself failed.
 *
 * No dependencies. Node 18+.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const flag = (name) => argv.includes(`--${name}`);

const ROOT = path.resolve(String(arg('root', process.cwd())));
const MD_OUT = arg('md', null);
const JSON_OUT = arg('json', null);
const FAIL_ON = String(arg('fail-on', 'none')).toLowerCase();
const ONLY = arg('only', null);
const IGNORE = new Set(
  String(arg('ignore', '') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);
const QUIET = flag('quiet');

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// ---------------------------------------------------------------------------
// Known-good version floors (update as upstream ships patches)
// Source: nextjs.org July 2026 security release — 16.2.11 (Active LTS),
// 15.5.21 (Maintenance LTS). Anything below these carries known CVEs.
// ---------------------------------------------------------------------------

const NEXT_PATCH_FLOORS = [
  { major: 16, minor: 2, patch: 11 },
  { major: 15, minor: 5, patch: 21 },
];

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.turbo', '.vercel', 'dist', 'build',
  'coverage', 'out', '.cache', '.pnpm-store', 'public', '.venv', '__pycache__',
]);

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** @returns {string[]} absolute paths */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github' && !e.name.startsWith('.env')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if (e.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FileCtx
 * @property {string} abs
 * @property {string} rel
 * @property {string} src
 * @property {string[]} lines
 * @property {boolean} isClient   "use client" directive present
 * @property {boolean} isServerActions  "use server" at module top
 * @property {'route'|'page'|'layout'|'middleware'|'component'|'lib'|'script'|'config'|'test'|'other'} kind
 */

function classify(rel, src) {
  const p = rel.replace(/\\/g, '/');
  const base = path.basename(p);
  const head = src.slice(0, 400);
  const isClient = /^\s*(['"])use client\1/m.test(head);
  const isServerActions = /^\s*(['"])use server\1/m.test(head);

  let kind = 'other';
  if (/^(src\/)?middleware\.(ts|js)$/.test(p)) kind = 'middleware';
  else if (/\/route\.(ts|js|tsx|jsx)$/.test(p)) kind = 'route';
  else if (/\/page\.(tsx|jsx|ts|js)$/.test(p)) kind = 'page';
  else if (/\/(layout|template)\.(tsx|jsx|ts|js)$/.test(p)) kind = 'layout';
  else if (/\.(test|spec)\.[tj]sx?$/.test(base) || /^(tests?|__tests__)\//.test(p)) kind = 'test';
  else if (/^scripts?\//.test(p)) kind = 'script';
  else if (/\.config\.[tmc]?[jt]s$/.test(base)) kind = 'config';
  else if (/^(src\/)?components?\//.test(p)) kind = 'component';
  else if (/^(src\/)?(lib|utils|server|services|domain)\//.test(p)) kind = 'lib';
  else if (/^(src\/)?app\//.test(p)) kind = 'component';

  return { isClient, isServerActions, kind };
}

// ---------------------------------------------------------------------------
// Helpers used by rules
// ---------------------------------------------------------------------------

const AUTH_HINTS = /\b(auth\(|getUser|getSession|getServerSession|currentUser|requireUser|requireAuth|assertUser|verifySession|createServerClient|clerkClient|withAuth|getToken|session\.user|supabase\.auth)/;
const VALIDATION_HINTS = /\b(z\.[a-zA-Z]|zod|valibot|yup\.|safeParse|\.parse\(|typebox|ArkType|superstruct)/;
// No leading \b: the common call site is `checkRateLimit(...)`, where there is
// no word boundary before "RateLimit". That single anchor made this rule report
// every correctly-limited endpoint as unlimited.
const RATELIMIT_HINTS = /(ratelimit|rate_limit|upstash|limiter|throttle|slowDown)/i;

const SECRETY_NAME = /(SECRET|KEY|TOKEN|PASSWORD|PASSWD|PRIVATE|SERVICE_ROLE|CREDENTIAL|WEBHOOK_SECRET|DSN|CONNECTION_STRING|DATABASE_URL)/i;
const SAFE_PUBLIC_NAME = /(PUBLISHABLE|ANON_KEY|PUBLIC_KEY|SITE_KEY|CLIENT_ID|POSTHOG_KEY|GA_|MAPBOX)/i;

/**
 * Strip comments cheaply so rules don't fire on prose. Preserves line count.
 *
 * The lookbehind on the block-comment pattern is load-bearing. A glob string
 * like "**\/*.ts" contains a literal `/*`, and without the guard the stripper
 * treated it as a comment opener and blanked everything up to the next `*\/` —
 * silently deleting real code from the analysis. `/*` only opens a comment when
 * it follows start-of-line, whitespace, or an operator/bracket.
 */
function stripComments(src) {
  return src
    .replace(/(^|[\s(,;={}[\]:])\/\*[\s\S]*?\*\//g, (m, p1) => p1 + m.slice(p1.length).replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(Math.max(0, m.length - p1.length)));
}

function* matchLines(ctx, re) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  for (let i = 0; i < ctx.codeLines.length; i++) {
    const line = ctx.codeLines[i];
    const r = new RegExp(re.source, flags);
    let m;
    while ((m = r.exec(line))) {
      yield { line: i + 1, text: ctx.lines[i].trim().slice(0, 200), match: m };
      if (m.index === r.lastIndex) r.lastIndex++;
    }
  }
}

function has(ctx, re) {
  return re.test(ctx.code);
}

// ---------------------------------------------------------------------------
// Rules
//
// Each rule: { id, title, category, severity, why, fix, appliesTo?, scan }
// scan(ctx, report) — call report({ line, detail }) for each finding.
// Repo-level rules use `scope: 'repo'` and receive the whole repo context.
// ---------------------------------------------------------------------------

const CATEGORIES = {
  SEC: 'Security',
  COR: 'Correctness',
  PERF: 'Performance',
  QUA: 'Code quality',
  OPS: 'Operations & CI',
};

/** @type {Array<any>} */
const RULES = [
  // ==========================================================================
  // SECURITY
  // ==========================================================================
  {
    id: 'SEC001',
    title: 'Next.js version is below the patched security floor',
    category: 'SEC',
    severity: 'critical',
    scope: 'repo',
    why: 'Next.js shipped middleware auth-bypass (CVE-2025-29927, CVSS 9.1), SSRF, cache-poisoning and Server-Action DoS fixes. Running below the floor means a documented, publicly exploitable bypass.',
    fix: 'Upgrade to >= 16.2.11 (Active LTS) or >= 15.5.21 (Maintenance LTS), then re-run `npm audit`.',
    scan(repo, report) {
      const v = repo.deps?.next;
      if (!v) return;
      const m = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
      if (!m) {
        report({ detail: `next is pinned as "${v}" — cannot verify against the patch floor. Pin an exact version.` });
        return;
      }
      const [maj, min, pat] = m.slice(1).map(Number);
      const floor = NEXT_PATCH_FLOORS.find((f) => f.major === maj);
      if (!floor) {
        if (maj < 15) report({ detail: `next@${maj}.${min}.${pat} is end-of-life. Upgrade to 15.5.21+ or 16.2.11+.` });
        return;
      }
      const below = min < floor.minor || (min === floor.minor && pat < floor.patch);
      if (below) {
        report({ detail: `next@${maj}.${min}.${pat} is below the patched floor ${floor.major}.${floor.minor}.${floor.patch}.` });
      }
    },
  },
  {
    id: 'SEC002',
    title: 'Route handler has no authentication or authorization check',
    category: 'SEC',
    severity: 'critical',
    why: 'Every file under app/api/**/route.ts is a public internet endpoint. Agent-written handlers routinely read/write user data with no session check, because the prompt described the happy path only.',
    fix: 'Resolve the session inside the handler (not in middleware) and 401 before touching data. Then authorize: confirm the session user owns the row being read or written.',
    appliesTo: (c) => c.kind === 'route',
    scan(ctx, report) {
      if (AUTH_HINTS.test(ctx.code)) return;
      // Public-by-design endpoints are usually named this way.
      if (/\/(health|healthz|ping|status|og|robots|sitemap|webhook|cron|revalidate|csp-report)\//.test(ctx.rel)) return;
      // The auth provider's own catch-all mount point *is* the sign-in endpoint;
      // requiring a session there would be circular.
      if (/\/api\/auth\//.test(ctx.rel)) return;
      const methods = [...ctx.code.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
      report({
        line: 1,
        detail: `Exports ${methods.join(', ') || 'a handler'} with no session lookup anywhere in the file.`,
      });
    },
  },
  {
    id: 'SEC003',
    title: 'Server action has no authentication check',
    category: 'SEC',
    severity: 'critical',
    why: 'A "use server" export is a public RPC endpoint with a stable ID. Anyone can POST to it directly — the fact that your UI only calls it from a logged-in page is not a control.',
    fix: 'Start every action with a `const user = await requireUser()` style guard that throws on failure. Do not rely on the calling component being behind auth.',
    appliesTo: (c) => c.isServerActions,
    scan(ctx, report) {
      if (AUTH_HINTS.test(ctx.code)) return;
      const actions = [...ctx.code.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
      if (!actions.length) return;
      report({ line: 1, detail: `Actions ${actions.slice(0, 8).join(', ')} are callable by anyone; no session lookup in this file.` });
    },
  },
  {
    id: 'SEC004',
    title: 'Server action accepts input without schema validation',
    category: 'SEC',
    severity: 'high',
    why: 'Server actions receive arbitrary attacker-controlled payloads. Unvalidated input reaching a DB write is how mass-assignment and type-confusion bugs happen — and in a nutrition app, how a NaN gram value ends up persisted.',
    fix: 'Parse every action argument with a Zod schema at the top of the function and return a typed error result on failure. Never spread raw input into a DB call.',
    appliesTo: (c) => c.isServerActions,
    scan(ctx, report) {
      if (VALIDATION_HINTS.test(ctx.code)) return;
      const takesInput = /export\s+async\s+function\s+\w+\s*\(\s*[^)]+\)/.test(ctx.code);
      if (!takesInput) return;
      report({ line: 1, detail: 'Exported actions take arguments but the file never parses them with a schema.' });
    },
  },
  {
    id: 'SEC005',
    title: 'Authorization decided in middleware (CVE-2025-29927 pattern)',
    category: 'SEC',
    severity: 'high',
    appliesTo: (c) => c.kind === 'middleware',
    why: 'Middleware is a routing convenience, not a security boundary. A crafted `x-middleware-subrequest` header bypassed it entirely (CVSS 9.1), and the July 2026 release patched a further dynamic-route bypass via query params.',
    fix: 'Keep the redirect in middleware for UX, but repeat the real check inside every route handler, server action, and data-access function. Defence in depth — the middleware check should be redundant.',
    scan(ctx, report) {
      const decides = /redirect|NextResponse\.(redirect|rewrite)|401|403/.test(ctx.code);
      if (!decides) return;
      report({ line: 1, detail: 'Middleware makes auth/redirect decisions. Verify the same check is duplicated at every data-access point.' });
    },
  },
  {
    id: 'SEC006',
    title: 'Secret-looking value exposed via NEXT_PUBLIC_',
    category: 'SEC',
    severity: 'critical',
    why: 'Anything prefixed NEXT_PUBLIC_ is inlined into the JavaScript bundle and readable by every visitor. A leaked service-role key is a full database compromise.',
    fix: 'Rename to a server-only variable, read it only in server code, and rotate the credential — it must be assumed public from the moment it shipped.',
    scan(ctx, report) {
      for (const { line, text, match } of matchLines(ctx, /NEXT_PUBLIC_[A-Z0-9_]+/)) {
        const name = match[0];
        if (SAFE_PUBLIC_NAME.test(name)) continue;
        if (SECRETY_NAME.test(name)) report({ line, detail: `${name} — ${text}` });
      }
    },
  },
  {
    id: 'SEC007',
    title: 'Privileged/admin client reachable from client-side code',
    category: 'SEC',
    severity: 'critical',
    why: 'A service-role or admin database client bypasses row-level security. Importing it into a "use client" module ships the credential and the bypass to the browser.',
    fix: 'Put privileged clients behind `import "server-only"` so the build fails loudly if a client component ever imports them.',
    appliesTo: (c) => c.isClient,
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /(SERVICE_ROLE|serviceRole|createAdminClient|adminClient|supabaseAdmin|SUPABASE_SERVICE)/)) {
        report({ line, detail: text });
      }
    },
  },
  {
    id: 'SEC008',
    title: 'Server-only module is not fenced with `server-only`',
    category: 'SEC',
    severity: 'medium',
    why: 'Without the fence, a future refactor (or an agent) can import a secret-reading module into a client component and silently leak it into the bundle. The fence turns that into a build error.',
    fix: 'Add `import "server-only";` as the first line of any module that reads secrets or talks to the database directly. Caveat: the `server-only` package throws when resolved outside a React Server Components graph, so a module also imported by a plain `tsx` script will break those scripts — move the secret-reading part into a fenced submodule instead of fencing the shared one.',
    appliesTo: (c) => c.kind === 'lib' && !c.isClient,
    scan(ctx, report) {
      const touchesSecrets = /process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD|SERVICE_ROLE|DATABASE_URL)/.test(ctx.code);
      if (!touchesSecrets) return;
      if (/import\s+['"]server-only['"]/.test(ctx.code)) return;
      report({ line: 1, detail: 'Reads a server secret but has no `import "server-only"` fence.' });
    },
  },
  {
    id: 'SEC009',
    title: 'No rate limiting on a public write endpoint',
    category: 'SEC',
    severity: 'high',
    why: 'The July 2026 release documented a Server-Action DoS: crafted requests pin CPU and block the whole process. Unmetered endpoints are also how you burn a third-party API quota or get IP-banned.',
    fix: 'Put a per-user and per-IP limiter (Upstash Ratelimit or equivalent) in front of every mutating action and route handler.',
    appliesTo: (c) => c.kind === 'route' || c.isServerActions,
    scan(ctx, report) {
      const mutates = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)/.test(ctx.code) || ctx.isServerActions;
      if (!mutates) return;
      if (RATELIMIT_HINTS.test(ctx.code)) return;
      report({ line: 1, detail: 'Mutating endpoint with no rate-limit call in the file.' });
    },
  },
  {
    id: 'SEC010',
    title: 'dangerouslySetInnerHTML',
    category: 'SEC',
    severity: 'high',
    why: 'The May 2026 advisories included App Router XSS around CSP nonces and early scripts. Any unsanitised HTML injection compounds that.',
    fix: 'Render as text, or sanitise with DOMPurify on a strict allowlist. If it is trusted static content, move it to a component.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /dangerouslySetInnerHTML/)) report({ line, detail: text });
    },
  },
  {
    id: 'SEC011',
    title: 'Environment file tracked in git',
    category: 'SEC',
    severity: 'critical',
    scope: 'repo',
    why: 'A committed .env is in history forever, including on every fork and clone. Deleting it later does not remove it.',
    fix: 'Remove from the index, add to .gitignore, rotate every credential it contained, and purge history if the repo was ever shared.',
    scan(repo, report) {
      for (const f of repo.trackedFiles) {
        if (/(^|\/)\.env(\.|$)/.test(f) && !/\.example$|\.sample$|\.template$/.test(f)) {
          report({ detail: `${f} is tracked by git.` });
        }
      }
    },
  },
  {
    id: 'SEC012',
    title: 'Hardcoded credential literal',
    category: 'SEC',
    severity: 'critical',
    why: 'Agent-written code frequently inlines a key it saw in the prompt or in an example, then the file gets committed.',
    fix: 'Move to an environment variable, rotate the credential, and add a secret scanner (gitleaks) to CI.',
    scan(ctx, report) {
      const pats = [
        /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/,
        /\bghp_[A-Za-z0-9]{30,}/,
        /\bAKIA[0-9A-Z]{16}\b/,
        /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
        /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i,
      ];
      for (const p of pats) {
        for (const { line, text } of matchLines(ctx, p)) {
          report({ line, detail: text.replace(/[A-Za-z0-9_-]{12,}/g, (s) => s.slice(0, 4) + '…redacted') });
        }
      }
    },
  },

  // ==========================================================================
  // CORRECTNESS
  // ==========================================================================
  {
    id: 'COR001',
    title: 'Type safety escape hatch (`any`, `as any`, `@ts-ignore`)',
    category: 'COR',
    severity: 'medium',
    why: 'Each one is a place the compiler stopped checking. In a nutrition app the usual consequence is a unit or shape mismatch — grams vs servings — that only surfaces as a wrong number on screen.',
    fix: 'Replace with a real type or `unknown` plus a narrowing guard. Prefer `@ts-expect-error` with a comment if suppression is truly unavoidable, so it fails when the underlying issue is fixed.',
    appliesTo: (c) => c.kind !== 'test',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /(:\s*any\b|as\s+any\b|<any>|@ts-ignore|@ts-nocheck|Array<any>|Record<string,\s*any>)/)) {
        report({ line, detail: text });
      }
    },
  },
  {
    id: 'COR002',
    title: 'Numeric parse without a finite check',
    category: 'COR',
    severity: 'high',
    why: 'parseFloat("") is NaN, Number(null) is 0, and Number(undefined) is NaN. A NaN propagates silently through a calorie total and renders as "NaN" or, worse, gets written to the database as null.',
    fix: 'Parse through a Zod `z.coerce.number().finite().nonnegative()` schema, or guard with Number.isFinite before use.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /(parseFloat\(|parseInt\(|Number\()/)) {
        // `Number(x) || 0` and `Number(x) ?? 0` already collapse NaN to a value.
        if (/\|\|\s*\d|\?\?\s*\d/.test(text)) continue;
        /*
          Look at the surrounding statement rather than the whole file. A file
          that guards one parse and forgets another is exactly the case worth
          reporting, so a single `Number.isFinite` anywhere must not silence the
          rest — the earlier whole-file check did that and hid real gaps.

          Five lines back also catches the common shape where the string was
          shape-tested first: `if (!/^\d+$/.test(raw)) return; const n = Number(raw)`.
          That is a real guard and should not be reported.
        */
        const from = Math.max(0, line - 6);
        const window = ctx.codeLines.slice(from, line + 4).join('\n');
        if (/Number\.isFinite|Number\.isNaN|isFinite\(|isNaN\(|z\.coerce\.number|\.finite\(/.test(window)) continue;
        if (/\.test\(\s*\w+\s*\)|\/\^\\d/.test(window)) continue;
        report({ line, detail: text });
      }
    },
  },
  {
    id: 'COR003',
    title: 'External fetch with no timeout or abort signal',
    category: 'COR',
    severity: 'high',
    why: 'Node fetch has no default timeout. One slow upstream (Open Food Facts is a donation-funded community service) hangs a serverless invocation until the platform kills it — the user sees a spinner forever and you pay for the wall time.',
    fix: 'Pass `signal: AbortSignal.timeout(3000)` and handle the abort as a typed "lookup unavailable" result rather than an exception.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /\bfetch\s*\(/)) {
        const window = ctx.codeLines.slice(line - 1, line + 12).join('\n');
        if (/signal\s*:|AbortSignal|AbortController|timeout/.test(window)) continue;
        if (/^\s*\/\//.test(text)) continue;
        // A same-origin call hangs the UI; a third-party call hangs a paid
        // serverless invocation. Both matter, but not equally.
        const external = /fetch\s*\(\s*[`'"]?https?:|fetch\s*\(\s*\w*(URL|ENDPOINT|API)/.test(text);
        report({ line, detail: external ? `${text}   [external upstream]` : text });
      }
    },
  },
  {
    id: 'COR004',
    title: 'Outbound API call without a User-Agent header',
    category: 'COR',
    severity: 'medium',
    why: 'Open Food Facts explicitly requires a custom User-Agent identifying your app, and reserves the right to IP-ban callers that ignore it. Vercel egress IPs are shared, so a ban is not necessarily yours alone to fix.',
    fix: 'Send `User-Agent: HealthOS/1.0 (contact@yourdomain)` on every OFF request, and cache results so you stay under 15 product reads/min per IP.',
    scan(ctx, report) {
      if (!/openfoodfacts|world\.openfood/i.test(ctx.code)) return;
      if (/[Uu]ser-?[Aa]gent/.test(ctx.code)) return;
      report({ line: 1, detail: 'Calls Open Food Facts without identifying itself via User-Agent.' });
    },
  },
  {
    id: 'COR005',
    title: 'Third-party lookup with no caching layer',
    category: 'COR',
    severity: 'medium',
    why: 'Open Food Facts allows ~15 product reads per minute per IP. A barcode scanner without a cache will trip that under trivial load, and the failure mode is a ban rather than a 429 you can retry.',
    fix: 'Cache by barcode — `unstable_cache`/`revalidate` for the read path plus a persisted products table so a scanned item is only ever fetched once.',
    scan(ctx, report) {
      if (!/openfoodfacts/i.test(ctx.code)) return;
      if (/unstable_cache|revalidate|cacheLife|redis|kv\.|upstash|\.cache\b|memo/i.test(ctx.code)) return;
      report({ line: 1, detail: 'No cache or revalidate hint around the Open Food Facts lookup.' });
    },
  },
  {
    id: 'COR006',
    title: 'Empty catch block swallows an error',
    category: 'COR',
    severity: 'high',
    why: 'A silent catch turns a bug into a wrong number on screen with no trace in logs. This is the single most common reason an agent-built feature "works" in review and fails in production.',
    fix: 'Log with context and either rethrow or return an explicit typed failure the UI can render.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /catch\s*(\([^)]*\))?\s*\{\s*\}/)) report({ line, detail: text });
      for (let i = 0; i < ctx.codeLines.length - 1; i++) {
        if (/catch\s*(\([^)]*\))?\s*\{\s*$/.test(ctx.codeLines[i]) && /^\s*\}\s*$/.test(ctx.codeLines[i + 1])) {
          report({ line: i + 1, detail: ctx.lines[i].trim() });
        }
      }
    },
  },
  {
    id: 'COR007',
    title: 'Floating-point arithmetic on a persisted quantity',
    category: 'COR',
    severity: 'low',
    why: '0.1 + 0.2 !== 0.3. Accumulating float grams across a day of logged meals produces totals that drift and never quite reconcile against the sum of their parts.',
    fix: 'Store nutrition quantities as integers in a base unit (milligrams, or grams×1000) and format at the edge.',
    appliesTo: (c) => /food|nutri|meal|macro|calor|portion|serving|weight|gram/i.test(c.rel),
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /(\bcalories|\bprotein|\bcarbs|\bfat|\bgrams?)\b[^;\n]*[+\-*/]=?\s/i)) {
        report({ line, detail: text });
      }
    },
  },
  {
    id: 'COR008',
    title: 'Non-null assertion on a value that crosses a trust boundary',
    category: 'COR',
    severity: 'medium',
    why: '`!` tells the compiler to stop asking. On a DB row or an API response — both of which can legitimately be null — it converts a handled absence into a runtime crash.',
    fix: 'Narrow explicitly and handle the null branch with a real user-facing state.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /(process\.env\.\w+!|\bdata!|\.rows!|\)!\.|\bresult!)/)) {
        report({ line, detail: text });
      }
    },
  },
  {
    id: 'COR009',
    title: 'Untested library module',
    category: 'COR',
    severity: 'medium',
    scope: 'repo',
    why: 'Pure domain logic — unit conversion, portion maths, barcode parsing — is the cheapest thing in the codebase to test and the most expensive to get wrong.',
    fix: 'Add a test file per lib module. Aim for the branch cases first: missing field, zero, negative, unit mismatch.',
    scan(repo, report) {
      const libs = repo.files.filter((f) => f.kind === 'lib' && !/index\.(ts|js)$/.test(f.rel));
      const testNames = new Set(
        repo.files
          .filter((f) => f.kind === 'test' || /^scripts?\/test-/.test(f.rel))
          .map((f) => path.basename(f.rel).replace(/\.(test|spec)\./, '.').replace(/^test-/, '').replace(/\.[tj]sx?$/, ''))
      );
      for (const l of libs) {
        const base = path.basename(l.rel).replace(/\.[tj]sx?$/, '');
        if (!testNames.has(base)) report({ detail: `${l.rel} has no matching test file.` });
      }
    },
  },

  // ==========================================================================
  // PERFORMANCE
  // ==========================================================================
  {
    id: 'PERF001',
    title: '"use client" on a page or layout',
    category: 'PERF',
    severity: 'high',
    why: 'This is the most common hidden LCP regression in App Router apps: the directive was added for one interactive element and it opted the entire subtree out of server rendering. INP is now the most-failed Core Web Vital, and this is why.',
    fix: 'Push the boundary down. Keep the page a server component and extract the interactive bit into its own small client component.',
    appliesTo: (c) => (c.kind === 'page' || c.kind === 'layout') && c.isClient,
    scan(ctx, report) {
      report({ line: 1, detail: `${ctx.kind} is a client component — its whole subtree ships to the browser.` });
    },
  },
  {
    id: 'PERF002',
    title: 'Raw <img> instead of next/image',
    category: 'PERF',
    severity: 'medium',
    why: 'next/image gives you AVIF/WebP negotiation, responsive srcsets, and intrinsic dimensions that prevent layout shift. A raw <img> gives you none of it and usually costs you CLS as well as LCP.',
    fix: 'Swap to next/image with explicit width/height (or fill + a sized parent), and mark the hero image `priority`.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /<img\s/)) report({ line, detail: text });
    },
  },
  {
    id: 'PERF003',
    title: 'Sequential awaits — likely request waterfall',
    category: 'PERF',
    severity: 'medium',
    why: 'Two independent awaits back to back serialise their latency. On a serverless function talking to a database in another region that is real, measurable TTFB, and TTFB is the biggest single lever on LCP.',
    fix: 'If the calls are independent, `await Promise.all([...])`. If one genuinely depends on the other, leave it and move the slow half behind Suspense.',
    scan(ctx, report) {
      if (/Promise\.all|Promise\.allSettled/.test(ctx.code)) return;
      for (let i = 0; i < ctx.codeLines.length - 1; i++) {
        const a = ctx.codeLines[i];
        const b = ctx.codeLines[i + 1];
        const isAwaitDecl = (s) => /^\s*(const|let|var)\s+[\w{[\s,\]}]+=\s*await\s+/.test(s);
        if (isAwaitDecl(a) && isAwaitDecl(b)) {
          report({ line: i + 1, detail: `${ctx.lines[i].trim().slice(0, 90)} → ${ctx.lines[i + 1].trim().slice(0, 90)}` });
          i++;
        }
      }
    },
  },
  {
    id: 'PERF004',
    title: 'force-dynamic / no-store disables caching wholesale',
    category: 'PERF',
    severity: 'medium',
    why: 'Agents reach for force-dynamic to make a stale-data bug go away. It works, and it also makes every request pay full origin latency forever.',
    fix: 'Use a targeted `revalidate` or tag-based invalidation instead. In a route handler, check first whether the directive is doing anything at all — an authenticated handler is already dynamic, and force-dynamic there only disables the fetch cache.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /(force-dynamic|cache:\s*['"]no-store['"]|revalidate\s*=\s*0)/)) {
        /*
          The sharp case, worth its own message: `force-dynamic` is documented as
          equivalent to setting every fetch() in the segment to
          `{ cache: "no-store", revalidate: 0 }`. So a route that declares it and
          *also* passes `next: { revalidate: N }` to an outbound fetch has a cache
          that reads as configured and never takes effect. Silent, and expensive
          when the upstream is rate-limited.
        */
        const usesRevalidatingFetch = /next:\s*\{[^}]*revalidate/.test(ctx.code);
        if (/force-dynamic/.test(text) && usesRevalidatingFetch) {
          report({
            line,
            detail: `${text}  ← overrides the \`next: { revalidate }\` on the fetch in this segment; the cache never applies`,
          });
          continue;
        }
        // A route handler that resolves a session is dynamic anyway, so the
        // directive is usually redundant rather than harmful. Report it quietly.
        if (ctx.kind === 'route' && !usesRevalidatingFetch) continue;
        report({ line, detail: text });
      }
    },
  },
  {
    id: 'PERF005',
    title: 'Client-side data fetch inside useEffect',
    category: 'PERF',
    severity: 'medium',
    why: 'Fetching in an effect guarantees a waterfall: HTML, then JS, then hydration, then the request, then the render. The data could have been on the server render.',
    fix: 'Fetch in the server component and pass down as props, or use a server action. Keep useEffect for genuinely client-only concerns.',
    appliesTo: (c) => c.isClient,
    scan(ctx, report) {
      const re = /useEffect\s*\(/g;
      let m;
      while ((m = re.exec(ctx.code))) {
        const line = ctx.code.slice(0, m.index).split('\n').length;
        const window = ctx.codeLines.slice(line - 1, line + 15).join('\n');
        if (/\bfetch\s*\(|axios\.|\.then\s*\(/.test(window)) {
          report({ line, detail: ctx.lines[line - 1]?.trim() ?? 'useEffect' });
        }
      }
    },
  },
  {
    id: 'PERF006',
    title: 'Heavy dependency imported into a client component',
    category: 'PERF',
    severity: 'medium',
    why: 'Chart, date, icon and PDF libraries dominate client bundles. Every kilobyte of JS is main-thread work, and main-thread work is INP.',
    fix: 'Import the specific function, or load the component with `next/dynamic` and `ssr: false` so it is not in the initial bundle.',
    appliesTo: (c) => c.isClient,
    scan(ctx, report) {
      const heavy = /(from\s+['"](moment|lodash|chart\.js|recharts|d3|three|pdfjs-dist|@mui\/material|jspdf|html2canvas|framer-motion)['"])|import\s+\*\s+as\s+\w+\s+from/;
      for (const { line, text } of matchLines(ctx, heavy)) {
        if (/next\/dynamic/.test(ctx.code)) continue;
        report({ line, detail: text });
      }
    },
  },

  // ==========================================================================
  // CODE QUALITY
  // ==========================================================================
  {
    id: 'QUA001',
    title: 'File is too long to review in one sitting',
    category: 'QUA',
    severity: 'low',
    why: 'Long files are where agent edits collide. Past roughly 400 lines a reviewer stops holding the whole thing in their head, and that is when regressions get merged.',
    fix: 'Split by responsibility: data access, domain logic, presentation.',
    scan(ctx, report) {
      if (ctx.lines.length > 400) report({ line: 1, detail: `${ctx.lines.length} lines.` });
    },
  },
  {
    id: 'QUA002',
    title: 'TODO / FIXME / HACK left in the code',
    category: 'QUA',
    severity: 'low',
    why: 'Each one is an admission of unfinished work that no tracker knows about.',
    fix: 'Either fix it now or convert it to a tracked issue and reference the issue ID in the comment.',
    scan(ctx, report) {
      for (const i in ctx.lines) {
        const t = ctx.lines[i];
        if (/\b(TODO|FIXME|HACK|XXX)\b/.test(t)) report({ line: Number(i) + 1, detail: t.trim().slice(0, 160) });
      }
    },
  },
  {
    id: 'QUA003',
    title: 'console.* left in shipped code',
    category: 'QUA',
    severity: 'low',
    why: 'Console logging is not observability — it is unsearchable, unstructured, and in a health app it is a plausible route for logging something you should not retain.',
    fix: 'Replace with a structured logger that redacts by default, and assert nothing sensitive is logged.',
    // lib/log.ts is the structured logger itself — it is expected to call
    // console.* under the hood, and flagging it here just points the rule at
    // its own implementation.
    appliesTo: (c) => c.kind !== 'script' && c.kind !== 'test' && c.kind !== 'config' && c.rel !== 'lib/log.ts',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /console\.(log|debug|info)\s*\(/)) report({ line, detail: text });
    },
  },
  {
    id: 'QUA004',
    title: 'Missing accessible name on an interactive element',
    category: 'QUA',
    severity: 'medium',
    why: 'Icon-only buttons are the standard output of a design-to-code agent and the standard screen-reader dead end. For a health tracker used daily, this is a real exclusion, not a lint nit.',
    fix: 'Add aria-label, or visually-hidden text inside the button.',
    scan(ctx, report) {
      for (const { line, text } of matchLines(ctx, /<button(?![^>]*aria-label)(?![^>]*aria-labelledby)[^>]*>\s*<(svg|[A-Z]\w+)/)) {
        report({ line, detail: text });
      }
    },
  },

  // ==========================================================================
  // OPS
  // ==========================================================================
  {
    id: 'OPS001',
    title: 'TypeScript is not in strict mode',
    category: 'OPS',
    severity: 'high',
    scope: 'repo',
    why: 'Without strict, null and undefined are assignable everywhere. Most "it rendered undefined" bugs in an agent-built app are a strict-mode error that was never surfaced.',
    fix: 'Enable strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes. Fix the resulting errors file by file.',
    scan(repo, report) {
      const co = repo.tsconfig?.compilerOptions ?? null;
      if (!repo.tsconfig) {
        report({ detail: 'No tsconfig.json found.' });
        return;
      }
      if (co?.strict !== true) report({ detail: '`strict` is not true in tsconfig.json.' });
      if (co?.noUncheckedIndexedAccess !== true) report({ detail: '`noUncheckedIndexedAccess` is off — array access is typed as always-present.' });
    },
  },
  {
    id: 'OPS002',
    title: 'Build errors are being ignored',
    category: 'OPS',
    severity: 'critical',
    scope: 'repo',
    why: 'ignoreBuildErrors / ignoreDuringBuilds means the deploy succeeds while the type checker is screaming. Every guarantee TypeScript gives you is off.',
    fix: 'Delete both flags. If the build then fails, that failure was already in production — it was just invisible.',
    scan(repo, report) {
      const cfg = repo.nextConfigSrc;
      if (!cfg) return;
      if (/ignoreBuildErrors\s*:\s*true/.test(cfg)) report({ detail: 'typescript.ignoreBuildErrors is true in next.config.' });
      if (/ignoreDuringBuilds\s*:\s*true/.test(cfg)) report({ detail: 'eslint.ignoreDuringBuilds is true in next.config.' });
    },
  },
  {
    id: 'OPS003',
    title: 'No CI workflow',
    category: 'OPS',
    severity: 'high',
    scope: 'repo',
    why: 'If the checks only run when someone remembers to run them, they do not run. Vercel building successfully is not the same as the code being correct.',
    fix: 'Add a GitHub Actions workflow running typecheck, lint, test and build on every PR, and make it a required status check.',
    scan(repo, report) {
      if (!repo.hasCI) report({ detail: 'No .github/workflows/*.yml found.' });
    },
  },
  {
    id: 'OPS004',
    title: 'No test runner configured',
    category: 'OPS',
    severity: 'high',
    scope: 'repo',
    why: 'Hand-rolled scripts that hit the live network are useful smoke tests but cannot run in CI deterministically, and they do not cover the branch cases.',
    fix: 'Add Vitest for unit tests and Playwright for the two or three flows that must never break. Keep the live-network scripts as a separate, manually-run suite.',
    scan(repo, report) {
      const d = { ...(repo.deps ?? {}), ...(repo.devDeps ?? {}) };
      if (d.vitest || d.jest || d['@playwright/test'] || d.cypress) return;
      report({ detail: 'No vitest / jest / playwright / cypress in package.json.' });
    },
  },
  {
    id: 'OPS005',
    title: 'No error monitoring',
    category: 'OPS',
    severity: 'medium',
    scope: 'repo',
    why: 'Without it, you learn about production errors from users. For a daily-use health app, most users will just stop opening it instead of telling you.',
    fix: 'Add Sentry (or equivalent) with source maps, plus a Next.js error.tsx and global-error.tsx boundary.',
    scan(repo, report) {
      const d = { ...(repo.deps ?? {}), ...(repo.devDeps ?? {}) };
      const hasMonitor = Object.keys(d).some((k) => /sentry|bugsnag|rollbar|datadog|highlight\.run|openreplay/i.test(k));
      if (!hasMonitor) report({ detail: 'No error monitoring dependency found.' });
      const hasBoundary = repo.files.some((f) => /\/(error|global-error)\.tsx$/.test(f.rel));
      if (!hasBoundary) report({ detail: 'No error.tsx / global-error.tsx boundary in the app directory.' });
    },
  },
  {
    id: 'OPS006',
    title: 'No environment variable schema',
    category: 'OPS',
    severity: 'medium',
    scope: 'repo',
    why: 'A missing env var on Vercel currently fails at runtime, in production, on the request that needed it — instead of at build time.',
    fix: 'Validate all env vars through a Zod schema in a single `env.ts` imported at startup, so a missing variable fails the build.',
    scan(repo, report) {
      const hasEnvModule = repo.files.some((f) => /(^|\/)env(\.mjs|\.ts|\.js)$/.test(f.rel));
      if (!hasEnvModule) report({ detail: 'No env.ts/env.mjs validation module found.' });
      const hasExample = repo.allFiles.some((f) => /\.env\.example|\.env\.sample|\.env\.template/.test(f));
      if (!hasExample) report({ detail: 'No .env.example — nobody can reproduce the environment.' });
    },
  },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function readJSON(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  // Try strict first. tsconfig.json is usually valid JSON, and the comment
  // stripper below is destructive on path globs like "**/*.ts" (which contain a
  // literal /* ). Reaching for it unconditionally is how "No tsconfig.json
  // found" gets reported for a tsconfig.json that is sitting right there.
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through to the tolerant parse */
  }
  try {
    return JSON.parse(stripJsonComments(raw));
  } catch {
    return null;
  }
}

/** tsconfig.json legally contains comments and trailing commas. */
function stripJsonComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/[^\n]*/g, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

function gitTrackedFiles(root) {
  try {
    return execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildRepoContext(root) {
  const absFiles = walk(root);
  const allFiles = absFiles.map((a) => path.relative(root, a).replace(/\\/g, '/'));

  const files = [];
  for (const abs of absFiles) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (!CODE_EXT.has(path.extname(abs))) continue;
    // Don't audit the auditor. Its rule table is a wall of the exact patterns it
    // looks for, so scanning itself produces nothing but noise.
    if (rel === 'audit/audit.mjs') continue;
    let src;
    try {
      src = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (src.length > 800_000) continue; // generated / vendored
    const meta = classify(rel, src);
    const code = stripComments(src);
    files.push({
      abs,
      rel,
      src,
      code,
      lines: src.split('\n'),
      codeLines: code.split('\n'),
      ...meta,
    });
  }

  const pkg = readJSON(path.join(root, 'package.json'));
  const tsconfig = readJSON(path.join(root, 'tsconfig.json'));
  const nextConfigPath = ['next.config.ts', 'next.config.mjs', 'next.config.js']
    .map((f) => path.join(root, f))
    .find((f) => fs.existsSync(f));

  return {
    root,
    files,
    allFiles,
    trackedFiles: gitTrackedFiles(root),
    pkg,
    deps: pkg?.dependencies ?? {},
    devDeps: pkg?.devDependencies ?? {},
    tsconfig,
    nextConfigSrc: nextConfigPath ? fs.readFileSync(nextConfigPath, 'utf8') : null,
    hasCI: fs.existsSync(path.join(root, '.github', 'workflows')) &&
      fs.readdirSync(path.join(root, '.github', 'workflows')).some((f) => /\.ya?ml$/.test(f)),
  };
}

function run(repo) {
  const findings = [];
  const rules = RULES.filter(
    (r) => (!ONLY || r.category === String(ONLY).toUpperCase()) && !IGNORE.has(r.id),
  );

  for (const rule of rules) {
    const push = (extra) => (o) =>
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        category: rule.category,
        severity: rule.severity,
        why: rule.why,
        fix: rule.fix,
        file: extra.file ?? '(repo)',
        line: o.line ?? null,
        detail: o.detail ?? '',
      });

    if (rule.scope === 'repo') {
      try {
        rule.scan(repo, push({}));
      } catch (e) {
        if (!QUIET) console.error(`  ! rule ${rule.id} errored: ${e.message}`);
      }
      continue;
    }

    for (const ctx of repo.files) {
      if (rule.appliesTo && !rule.appliesTo(ctx)) continue;
      try {
        rule.scan(ctx, push({ file: ctx.rel }));
      } catch (e) {
        if (!QUIET) console.error(`  ! rule ${rule.id} errored on ${ctx.rel}: ${e.message}`);
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const C = process.stdout.isTTY
  ? { r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[34m', g: '\x1b[32m', d: '\x1b[2m', bo: '\x1b[1m', x: '\x1b[0m' }
  : { r: '', y: '', b: '', g: '', d: '', bo: '', x: '' };

const SEV_COLOR = { critical: C.r, high: C.r, medium: C.y, low: C.b, info: C.d };

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function printReport(findings, repo) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  console.log('');
  console.log(`${C.bo}nextaudit${C.x} ${C.d}·${C.x} ${repo.files.length} source files ${C.d}·${C.x} ${path.basename(repo.root)}`);
  console.log('─'.repeat(72));

  const byRule = groupBy(findings, (f) => f.ruleId);
  const ordered = [...byRule.entries()].sort(
    (a, b) => SEVERITY_ORDER[b[1][0].severity] - SEVERITY_ORDER[a[1][0].severity] || b[1].length - a[1].length
  );

  for (const [ruleId, fs_] of ordered) {
    const f0 = fs_[0];
    const col = SEV_COLOR[f0.severity];
    console.log('');
    console.log(`${col}${C.bo}${f0.severity.toUpperCase().padEnd(8)}${C.x} ${C.bo}${ruleId}${C.x} ${f0.title} ${C.d}(${fs_.length})${C.x}`);
    console.log(`  ${C.d}why:${C.x} ${f0.why}`);
    console.log(`  ${C.d}fix:${C.x} ${f0.fix}`);
    const show = fs_.slice(0, 10);
    for (const f of show) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      console.log(`    ${C.d}·${C.x} ${loc}${f.detail ? `  ${C.d}${f.detail}${C.x}` : ''}`);
    }
    if (fs_.length > show.length) console.log(`    ${C.d}… and ${fs_.length - show.length} more${C.x}`);
  }

  console.log('');
  console.log('─'.repeat(72));
  const summary = ['critical', 'high', 'medium', 'low']
    .map((s) => `${SEV_COLOR[s]}${counts[s]} ${s}${C.x}`)
    .join(C.d + ' · ' + C.x);
  console.log(`  ${summary}`);
  console.log('');
}

function markdownReport(findings, repo) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  const out = [];
  out.push('# Code audit report');
  out.push('');
  out.push(`Generated ${new Date().toISOString().slice(0, 10)} against \`${path.basename(repo.root)}\` — ${repo.files.length} source files.`);
  out.push('');
  out.push('| Severity | Count |');
  out.push('| --- | --- |');
  for (const s of ['critical', 'high', 'medium', 'low']) out.push(`| ${s} | ${counts[s]} |`);
  out.push('');

  const byCat = groupBy(findings, (f) => f.category);
  for (const [cat, list] of [...byCat.entries()].sort()) {
    out.push(`## ${CATEGORIES[cat] ?? cat}`);
    out.push('');
    const byRule = groupBy(list, (f) => f.ruleId);
    const ordered = [...byRule.entries()].sort(
      (a, b) => SEVERITY_ORDER[b[1][0].severity] - SEVERITY_ORDER[a[1][0].severity]
    );
    for (const [ruleId, fs_] of ordered) {
      const f0 = fs_[0];
      out.push(`### ${ruleId} — ${f0.title}`);
      out.push('');
      out.push(`**Severity:** ${f0.severity} · **Occurrences:** ${fs_.length}`);
      out.push('');
      out.push(`**Why it matters.** ${f0.why}`);
      out.push('');
      out.push(`**Fix.** ${f0.fix}`);
      out.push('');
      out.push('<details><summary>Locations</summary>');
      out.push('');
      for (const f of fs_.slice(0, 50)) {
        out.push(`- \`${f.file}${f.line ? ':' + f.line : ''}\`${f.detail ? ` — ${f.detail.replace(/\|/g, '\\|')}` : ''}`);
      }
      if (fs_.length > 50) out.push(`- … and ${fs_.length - 50} more`);
      out.push('');
      out.push('</details>');
      out.push('');
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  if (!fs.existsSync(ROOT)) {
    console.error(`No such directory: ${ROOT}`);
    process.exit(2);
  }
  const repo = buildRepoContext(ROOT);
  const findings = run(repo);

  if (!QUIET) printReport(findings, repo);

  if (MD_OUT && typeof MD_OUT === 'string') {
    fs.writeFileSync(path.resolve(MD_OUT), markdownReport(findings, repo));
    if (!QUIET) console.log(`  markdown report → ${MD_OUT}`);
  }
  if (JSON_OUT && typeof JSON_OUT === 'string') {
    fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({ root: repo.root, generated: new Date().toISOString(), findings }, null, 2));
    if (!QUIET) console.log(`  json report → ${JSON_OUT}`);
  }

  if (FAIL_ON !== 'none') {
    const threshold = SEVERITY_ORDER[FAIL_ON] ?? 3;
    const breaching = findings.filter((f) => SEVERITY_ORDER[f.severity] >= threshold);
    if (breaching.length) {
      console.error(`\n  ✖ ${breaching.length} finding(s) at or above "${FAIL_ON}".\n`);
      process.exit(1);
    }
  }
  process.exit(0);
} catch (e) {
  console.error('auditor failed:', e);
  process.exit(2);
}
