# CLAUDE.md — read this before writing any code

## 1. The canonical documents

`docs/PRODUCT_DNA.md` is **CANONICAL**. It is the founder's product
specification, not a summary someone wrote afterwards. Read it in full before
you touch anything.

It carries an instruction that binds you:

> If a proposed change conflicts with this document, STOP and flag it to the
> founder — do not silently proceed.

`docs/DEMO_SPEC.md` was the build spec for the scripted demo. **That demo has
been deleted at the founder's instruction** (see §4), so this file is now
historical: its fixture-marking rules no longer apply to any live code. It is
deliberately kept rather than deleted, because it is a founder document and
deleting one is the founder's call, not yours. Its *principles* — never claim
more than you can show, mark estimates as estimates — still bind, and are now
enforced in `lib/food/recognize.ts` instead.

`PRODUCT_DNA.md` is not a suggestion. If this file and it ever disagree, **it
wins** and this file is the thing that is wrong.

## 2. Two rules that have already been broken once

An agent (v0) violated both of these while building the community layer. They
are called out first because they are the failure modes this codebase actually
experiences, not hypothetical ones.

### 2.1 §8 decisions are not yours to make

`PRODUCT_DNA.md §8` lists open questions reserved for the founder. The social
layer's **build order and privacy model** is one of them.

v0 was asked for a friend check-in map — which is canonical architecture in
DNA Block 6 — and talked the founder *out of it* using a "thesis" it had
inferred from the conversation rather than read from the doc. That was a §8
decision made unilaterally, against the spec, on invented grounds.

If you find yourself constructing an argument for why a canonical feature is a
bad idea: stop and ask. You may be right, but it is not your call, and a
plausible-sounding rationale is exactly what this failure looked like from the
inside.

### 2.2 Every invented fixture value must be marked

`DEMO_SPEC.md §4`: no fixture value invented by the agent without marking it
`[ASSUMPTION]`.

v0 authored an entire community dataset — venue names, log counts, kcal ranges —
with zero markers, including real restaurant names attached to invented
nutrition numbers.

`lib/fixtures/` has since been deleted with the demo (§4), so the specific file
is gone and there is currently no fixture data in the app. The rule survives it
and is the reason this section stays: **never attach an invented nutritional
number to a business that exists.** If community features return, place names
must be descriptive ("Wok stall — north lane"), not real venues.

The generalised form now applies to model output instead of fixtures: an
estimate is labelled as an estimate, with its confidence, or it is not shown.

### 2.3 An external design audit does not outrank the spec

A Modernist redesign audit was delivered as a PDF (dropped in `.v0/feedback/`,
gitignored). Its UX findings were sharp and several are now implemented — but
its visual direction contradicted `DEMO_SPEC.md §1.5`, *"Presentation layer —
LOCKED to the Journey Frames mockup"*, and it said so on page 2: it had been
written **without** the journey-frames reference, which is in the repo at
`design/journey-frames.pdf`.

The founder's ruling, on the record:

- **Adopt** the non-conflicting UX fixes only.
- **Reject** the light theme, Archivo, zero-radius, wizard-replaces-chat, and
  engine-demoted-to-a-drawer changes. Dark, chat-first, engine-visible stands.
- **Red stays medical-only.** The audit used red for its primary CTA while its
  own page 6 said *"red never means bad performance, only that a medical rule is
  in view."* `DEMO_SPEC §1.6.6` agrees. The audit lost to itself here.

The lesson generalises: a document arriving later, with more confidence and
better typography, is still not canonical. Check it against the two docs in
`docs/` and flag the conflict instead of implementing the newest thing you read.

### 2.4 Live mode graduated past DEMO_SPEC; the demo path did not change

`DEMO_SPEC.md` lists as non-goals exactly what real WHOOP data requires: *"No
health data"* (§13), *"No backend for v1"* (§146), *"real wearable
connections"* (§203). `PRODUCT_DNA.md §97` pulls the other way — onboarding
*"does not exist yet — must be built"*, with wearable connection named as a
differentiator.

The founder's ruling, on the record:

- **Dual mode.** The scripted `/day` replay stays exactly as specced, for
  pitching without a login. Real WHOOP data lives in a separate authenticated
  **Live mode**. A change to Live mode must not touch the demo path.
- **WHOOP now; Garmin marked honestly unavailable.** The Garmin Health API is
  closed to new third-party developers — the application form is gone and
  access is restricted to enterprise partners. A "Connect Garmin" button would
  be theatre, which §4.11 forbids. Reaching Garmin later means an aggregator
  (Terra, Vital), which is a paid dependency and a separate decision.
- **Photos are content, not a fix.** See §2.5.

### 2.5 Two claims I made that measurement disproved

Both were plausible, confidently stated, and wrong. Recorded so they are not
repeated or "re-fixed" on my authority.

- **"The feed ships 16 MB of images to mobile."** It does not. `next/image` is
  active with correct `sizes` and no `unoptimized` flag, so a 2090 KB source
  PNG is served as **8 KB** at a 302 px viewport — a 99.6% reduction that was
  already happening. The 16 MB is repo weight only. There was no performance
  bug; the image task was deleted rather than "fixed".
- **"Register `https://healthos-3.v0.build/...` with WHOOP."** That origin is
  **not public**. It answers `302` to `v0.app/chat/unauthorized`, because the
  preview is scoped to the authenticated chat. WHOOP cannot fetch a privacy
  policy behind it, and an OAuth callback would be bounced through the gate.
  Both URLs must come from the published Vercel domain.

The pattern in both: an assumption about the platform, asserted instead of
measured. `curl` the origin and measure the transfer before advising.

### 2.6 Auth in this sandbox: the origin is not localhost

Sign-in failed with Better Auth's `Invalid origin` even though the dev server
binds to `localhost:3000`. The browser reaches the app through a rotating v0
proxy host (`https://sb-<id>.vercel.run`), and that is the `Origin` header
Better Auth validates. Listing `localhost` alone does not fix it.

`lib/auth.ts` therefore adds `https://*.vercel.run` and `https://*.v0.build`
to `trustedOrigins` **in development only** — wildcards are supported, see
`node_modules/better-auth/dist/auth/trusted-origins.mjs`. Production keeps the
explicit URL cascade. Do not "simplify" this to localhost; sign-in will break
in the preview.

Two related constraints in the same file, both load-bearing:

- The dev-mode `sameSite: "none", secure: true` cookie override is required
  because the preview renders in a cross-site iframe. Without it the session
  cookie is silently dropped and the user looks permanently logged out.
- `BETTER_AUTH_SECRET` lives in `.env.local` (gitignored) as a dev-only value
  so the flow could be built and tested. Production **throws** if the secret is
  missing rather than falling back — a silent fallback would sign real sessions
  with a throwaway key. A real secret must be set in Vercel env vars.

This project is Next **14.2**, so `headers()` and `cookies()` are synchronous.
The Neon skill's examples are Next 16 and `await` them; do not copy that here.

### 2.7 `tsc` is not the build — but the build fights the dev server

Two failures got past a clean `tsc --noEmit` and only appeared in `next build`:

1. **Route files may only export a fixed set of fields.** Exporting a shared
   constant from `app/api/whoop/connect/route.ts` failed the build with
   `"WHOOP_STATE_COOKIE" is not a valid Route export field`. Shared values go in
   a plain module — hence `lib/whoop/oauth-state.ts`. The original version also
   imported it from the *other route module*, dragging one route's graph into
   another; the shared module fixes both problems at once.
2. **An empty directory under `app/` breaks the build.** After deleting a
   scratch page, the leftover empty folder made page-data collection fall back
   to the pages router and die with `Cannot find module for page: /_document`.
   Git does not track empty directories, so this never reaches origin and is
   invisible in `git status` — it only wedges the local build. Check with
   `find app -type d -empty`.

So the build is the only thing that validates route exports — **and** §6 says
never to run it against a live dev server. Both are true, which is why there are
two scripts:

- `npm run verify` — typecheck plus the three test suites. Safe at any time.
- `npm run verify:build` — the above plus `next build`. **Stop the dev server
  first, and restart it afterwards.** Running it against a live dev server
  produces exactly the §6 symptom: pages still answer 200 while
  `/_next/static/chunks/main-app.js` answers 500, so nothing hydrates and every
  button is silently dead. Confirmed by doing it, then measuring both.

Two more things about `tsc` here:

- **`next build` rewrites `tsconfig.json`** on every run, re-adding
  `.next/types/**/*.ts` to `include`, so excluding `.next` there is always
  undone. `typecheck` uses `tsconfig.typecheck.json`, which Next leaves alone.
  Next never prunes the generated type file for a deleted route, so without
  that exclusion a removed page leaves a permanent phantom TS2307.
- Expect `[Better Auth]: Base URL is not set` during `next build`. It is
  build-time only and harmless: `VERCEL_URL` and
  `VERCEL_PROJECT_PRODUCTION_URL` are injected at runtime, not build time. Do
  not "fix" it by hardcoding an origin — see the `baseURL` comment in
  `lib/auth.ts` for why the stable production URL must win over the
  per-deployment one, which matters because WHOOP's redirect URI is registered
  once.

### 2.8 The vision model list is measured, not chosen

`lib/food/recognize.ts` picks models by what the gateway *actually serves on this
project's tier*, which is not the same as what the model list advertises:

- Every `gemini-3.x` model — including `gemini-3-flash` — returns **"Free tier
  users do not have access to this model"**. They appear in
  `GET /v1/models` regardless, so listing a model proves nothing about access.
- `gemini-2.5-flash` and `gemini-2.5-flash-lite` work.
- `openai/gpt-4o-mini` works but hits `429 rate limit exceeded` quickly, so it is
  last, not first.

Two consequences worth keeping:

- **Probing burns the quota.** A handful of test calls put *all* models into 429
  for a while. If recognition suddenly degrades during development, suspect the
  quota before the code.
- **`maxRetries: 1`.** The SDK default of 3 across three models is nine round
  trips, measured at 22s against a rate-limited gateway — past the route budget,
  so the user would see a timeout instead of the graceful "type it in" fallback.

**`disallowPromptTraining: true` is not decoration — do not remove it.** The AI
Gateway "does not route based on the training data policy of providers" by
default, and its docs state that where Vercel has no agreement with a provider it
*assumes that provider trains on your data*. Without the flag, photographs of
users' meals — and their kitchens, hands, and dining companions — are training
data by default. The opt-out is free.

It can fail closed: if no compliant provider serves a model, the request returns
`400 no_providers_available` rather than quietly routing to a training provider.
That is the intended behaviour — the chain tries the next model, and if none
qualify the user types the meal in. Measured: `gemini-2.5-flash` and
`gemini-2.5-flash-lite` both serve requests with the flag on. `gpt-4o-mini`
returns 429 with it and 200 without, which is a rate limit on the compliant
route rather than a policy refusal — it was already the unreliable last resort.

If you ever loosen this, the privacy page's "may only be handled by providers
that do not use it to train their models" becomes a false statement about
medical-adjacent data. Change both or neither.

To re-measure after a tier change, run the recognition path directly against a
real photo without going through the browser:

```
npx tsx --env-file-if-exists=/vercel/share/.env.project \
  scripts/probe-recognize.ts public/feed/boat-noodles.png
```

It prints the chosen model, so it tells you which entry in `MODELS` actually
answered rather than which one you hoped would.

**Run it twice on the same photo.** The identical steak image returned 1000 kcal
/ 80 g protein on one call and 780 / 75 on the next — same model, same bytes,
~20% apart. That is not a bug to chase; it is the actual precision of a photo
estimate, and it is the strongest available argument for why the confirm step
exists and why every row carries `estimated: true`. If anyone proposes
auto-logging the model's number, reproduce this first.

If paid credits are added, promote `google/gemini-3.6-flash` to the front of
`MODELS`; nothing else needs to change. Verify the degraded path by temporarily
replacing `MODELS` with one bogus id — the confirm card must show empty fields
and a disabled button, never a fabricated number.

## 3. Product rules that constrain code, not just copy

These come from the DNA. They are listed here because each one has a concrete
implementation consequence that is easy to break by accident.

- **The system proposes, the user disposes** (§4.12). Nothing auto-applies. A
  reply that changes targets must offer choices, not announce a change.
- **Medical rules never suspend.** `accent-red` is reserved for the
  never-suspends card. Do not spend that colour anywhere else — it is the one
  signal in the product that must never compete for attention.
- **Never claim precision the data does not support.** If headroom is not
  actually there, say so. There is a fixed test for this: a "can I fit X" reply
  on a spent day must refuse, not reassure.
- **Community data narrows estimates; it never overrides a rule.** A dish that
  trips a bloodwork ceiling still trips it at 412 logs.
- **Uncertainty is sometimes irreducible.** Some dishes' variance is the user's
  own portion, and no amount of extra data fixes that. The UI must not imply it
  can. This used to be enforced by `tightestVenue()` returning `null`; that code
  went with the demo, and the live equivalent is `recognize.ts` returning
  `unavailable` or `implausible` instead of a number it cannot stand behind.

## 4. Where things are

```
app/live/           the only day view — real WHOOP + goal contract + planner
app/log/            meal photo logging (upload → recognise → confirm → list)
app/api/meal-photo/upload/  strip EXIF server-side, store private, recognise
app/api/meals/      POST a confirmed meal, GET today's meals
lib/food/recognize.ts   vision estimate; fallback chain, never fabricates
lib/live/build-day.ts   joins recovery + sleep + contract into a timed day
lib/live/local-day.ts   the user's calendar day, in *their* timezone
lib/planner/        pure planner. No IO, no fixtures — this is why it is testable
lib/photo/photo-path.ts per-user blob prefix; the ownership boundary
docs/               PRODUCT_DNA.md (canonical)
```

**The scripted demo has been deleted** (`app/day`, `app/results`, `lib/store.ts`,
`lib/agent/`, `lib/fixtures/`, `lib/reducer.ts`, `components/cards/`, and the
phone-frame chat UI). It was a 669-line fixture narrative sitting next to real
output, which is exactly what someone mistakes for their own data. `DEMO_SPEC.md`
now describes nothing that exists. If you need the walkthrough back, it is in
git history — do not rebuild it beside `/live`.

`public/feed/*.png` survived the deletion on purpose: they are the only real
photographs in the repo, so they are the EXIF-strip and recognition fixtures.

`app/api/agent/` went with it, and the reason is worth keeping. It was a real,
working open-ended chat endpoint, but its only caller was the deleted chat UI —
leaving an **unauthenticated** route that calls a paid model. Deployed, anyone
could POST to it and drain the same gateway quota `recognize.ts` depends on, so
dead code would have been able to disable a live feature. If you bring the chat
back, gate it on a session first; it is in git history.

## 5. Current state

Built and verified in-browser at mobile portrait (302px), which is the primary
surface. Everything below was exercised end-to-end against the live database,
not just typechecked.

**Real and working:**

- Email + password auth (Better Auth), goal contract persisted in Neon.
- `/live` — joins WHOOP recovery/sleep with the goal contract via the pure
  planner. Every failure is a named union variant, so it cannot render a plan
  built from nothing. Timezone is load-bearing: WHOOP returns sleep-end as a UTC
  instant plus the user's offset, so formatting in the server's zone would shift
  every meal. 24 checks cover offsets, midnight wrap both ways, half/45-minute
  zones, and nap filtering.
- `/log` — the full food loop. Photo → **server-side** EXIF/GPS strip → private
  blob under a per-user prefix → vision estimate → **user confirms** → row in
  `meal_log` → today's list against live targets.

**Why the confirm step is not optional** (§4.12): an auto-logged wrong estimate
silently corrupts the day's totals, and the whole argument of the app is that it
does not invent numbers. The confirm card shows the model's own `confidence` and
`caveat`, and every stored row carries `estimated: true` plus `source`.

**The degraded path is the important one.** When every model is unreachable or
rate-limited, recognition returns `unavailable`: fields come up empty, the log
button stays disabled, and the photo is still saved. Verified by forcing it, not
assumed. Recognition failure must never fail the upload — the photo is already
stored and clean, and a model outage should downgrade the user to typing, not
lose their photo.

Ownership is enforced by prefix, verified: unauthenticated `GET`/`POST` on both
meal routes return 401, and an authenticated request for another user's photo
pathname returns 404 rather than a signed URL.

- `/live` now shows logged protein against the day's commitment
  (`components/live/logged-against-target.tsx`), reading `proposal.dayTarget`.

### 5.0 WHOOP disconnect, and the promise the policy was making alone

The privacy policy said "you can disconnect WHOOP at any time from inside the
app". It was the **only** file in the repo containing the word "disconnect" —
there was no route, no action, no button. A false promise, in the one document
users are shown during OAuth consent and that WHOOP reviews. Fixed by building
the disconnect, not by softening the sentence.

`revokeWhoopAccess` calls `DELETE /v2/user/access` (WHOOP's own scheme, not
RFC 7009; answers 204) *before* deleting the local row. Deleting our tokens alone
would leave the grant live in the user's WHOOP account. It refreshes the token
first, or a user returning a day later would silently fail to revoke remotely.

The local delete proceeds **even when the remote revoke fails** — they asked us
to stop holding their credentials, and keeping them because a network call failed
is backwards. But the failure is *returned*, because "disconnected" and
"disconnected here, still authorised at WHOOP" are different states and only the
user can finish the second one.

**The bug worth remembering:** the button was first rendered as
`{conn ? <DisconnectButton/> : null}`. Disconnecting calls `revalidatePath`, the
server re-renders with `conn === null`, the component unmounts, and the React
state holding the result message is destroyed — so the user saw *no* confirmation,
and the message that mattered most ("we could not confirm revocation, remove it
in WHOOP's settings") was the one discarded. Any component that reports the
outcome of an action which changes its own render condition must stay mounted:
pass `connected` as a prop and check `result` **before** `connected`, since after
success `connected` is false.

Verified end to end with a deliberately invalid token to exercise the partial
path: tokens deleted, revoke unconfirmed, instruction preserved on screen.

### 5.1 The macro columns were dead, and that was invisible

`proteinTargetG`, `proteinFloorG`, `carbTargetG`, `kcalTarget` and `mealsPerDay`
existed in the schema and were *read* throughout the planner, but **nothing ever
wrote them**. Every profile had them null, so the planner's whole per-slot macro
path was permanently inert and no user could ever have a target. The types were
satisfied end to end; only querying the live row revealed it.

The lesson generalises: a nullable column that is read but never written
typechecks perfectly and silently disables the feature that depends on it. When a
feature "does nothing", check that its inputs are actually populated before
debugging the logic.

The goal step now collects target and floor. Deliberately typed, not derived from
bodyweight: a derived figure is the app's inference wearing the user's
commitment, and §4.11 forbids exactly that. Blank stays null.

`DayTarget.proteinKind` carries `TARGET | FLOOR` because the two are different
claims — clearing a 150g floor is a success, missing a 205g target by 55g is not,
and one bar showing one number without saying which would be the same failure.
Note the trap encoded in the tests: on an imprecise day with *no* floor set the
figure falls back to the target, so it must not then be labelled a floor.

Validation rejects a floor above the target (almost always the two swapped) and
anything outside 20–400g, since 1600 for 160 is a typo that would silently
reshape every plan. When no target is set the card shows the real logged total
with **no bar** — a progress bar needs a denominator, and showing nothing at all
would hide data the user typed in by hand.

**Not real yet:** nothing reads `meal_log` back into the *planner*, so logging a
meal changes the header but not the next proposal. That is the next seam.

## 6. Working practice

- `npm run dev` — do **not** run `npm run build` against a running dev server.
  It overwrites the dev client chunks, `main-app.js` starts 404ing (or 500ing),
  and the app silently stops hydrating: buttons do nothing and the cause is
  invisible. If you must build, stop dev first and restart it after. To check
  for the damage: `curl -o /dev/null -w '%{http_code}'
  http://localhost:3000/_next/static/chunks/main-app.js` — a 200 page with a
  non-200 `main-app.js` is this bug.
- **`pkill -f "next dev"` does not reliably kill it here, and fails silently.**
  This turns the advice above into a trap: you "stop" dev, build, start dev
  again, and the new server finds port 3000 taken, prints `Port 3000 is in use,
  trying 3001` into a log you are not reading, and settles on 3002. Port 3000 is
  still answering — from the *orphaned* server holding the stale post-build
  chunks — so the app looks up but nothing hydrates, and the port the preview
  actually uses is not the port your new server is on. Three servers had stacked
  up this way before it was noticed.

  Kill by port and verify, rather than trusting `pkill`:

  ```bash
  lsof -ti:3000,3001,3002        # then kill -9 the pids
  ps -eo pid,args | grep -E "next dev|next-server" | grep -v grep
  ```

  **`lsof` alone is not enough either.** It has since returned *nothing* while
  `ps` found two live `next-server` processes on the same machine. The `ps`
  cross-check is what actually catches them, so treat it as the authority and
  kill the PIDs it reports:

  ```bash
  ps -eo pid,args | grep -E "next dev|next-server" | grep -v grep \
    | awk '{print $1}' | xargs -r kill -9
  ```

### 6.1 A passing local build is not evidence the deploy will work

Publishing failed while `npm run build` passed locally. Cause: `lib/auth.ts`
deliberately throws when `BETTER_AUTH_SECRET` is missing and
`NODE_ENV === "production"` (correctly — a silently defaulted auth secret would
invalidate every session). The secret existed **only in `.env.local`**, which is
gitignored, so it never left the sandbox. Next loads `.env.local` automatically,
so the local build sailed through; Vercel had no such file and the build threw at
import time.

The general trap: **a gitignored local env file makes the local build a false
positive for anything that fail-louds on a missing secret.** Local success and
deploy success are testing different environments.

To reproduce what Vercel actually does, temporarily move `.env.local` aside and
build from the project-level env only:

```bash
mv .env.local /tmp/env.local.bak
set -a && source /vercel/share/.env.project && set +a && NODE_ENV=production npm run build
mv /tmp/env.local.bak .env.local
```

Vars that must exist at **project** level, not just locally: `BETTER_AUTH_SECRET`,
`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`. The `WHOOP_*` vars are the deliberate
exception — they are allowed to be absent and degrade to `NO_WHOOP_APP` rather
than throwing, so they never block a build.

  The second command must print nothing before you restart. Afterwards, confirm
  the server you *think* you are talking to is the one on 3000: read the dev
  log's `Local:` line, don't assume.
- Do not try to fix a chunk problem by deleting `.next` — the sandbox forbids it.
  Killing the orphaned servers is the actual fix, because the stale chunks are
  being served by a stale process, not merely sitting on disk.
- Ignore `Invalid next.config.mjs options detected` naming `devIndicators`,
  `transitionIndicator` or `turbopackFileSystemCacheForDev`. Those keys are not in
  this repo's config (which sets only `reactStrictMode`) — the v0 sandbox injects
  them, and they are Next 15/16 options that **14.2.35** rejects. Nothing to fix
  here; editing `next.config.mjs` will not silence it.
- This project is on **Next 14.2.35** (App Router), not 15 or 16. So `params`,
  `searchParams`, `cookies()` and `headers()` are still *synchronous* here. Do not
  "modernise" them to awaited calls based on newer docs.
- `npm run verify` before every commit (typecheck + planner, metadata and
  live-day suites). `npm run verify:build` additionally runs the production
  build, which is the only step that catches invalid route exports — see §2.7.
- Verify UI changes at 302px before calling them done. A clean type-check is not
  evidence that anything works, and neither is a successful build.
- **`agent-browser upload` does not work in this sandbox.** It reports success,
  but the injected file has no readable backing store, so the subsequent
  `fetch` dies with a bare `TypeError: Failed to fetch` that looks exactly like
  a broken upload route. Diagnosed by elimination: the same file posted fine
  from Node, and posting from page context returned a correct 415, so the route
  was never at fault. To drive a file input for real, build the `File` in-page
  and dispatch the change event — this exercises the true component path:

  ```js
  const buf = await (await fetch('/some-fixture.png')).arrayBuffer();
  const dt = new DataTransfer();
  dt.items.add(new File([buf], 'meal.png', { type: 'image/png' }));
  const input = document.querySelector('#meal-photo-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  ```

  The fixture has to be reachable over HTTP, so stage it in `public/` and
  delete it afterwards — it must not ship. `scripts/make-dirty-fixture.ts`
  generates a photo carrying real EXIF/GPS for this purpose.
- Arithmetic shown to the user is checked, not trusted. This used to mean fixture
  venue counts summing to their dish totals; with the fixtures gone it means the
  day's logged total must be the sum of its rows, and the model's per-item macros
  must sum to the totals first shown on the confirm card. Note the asymmetry: once
  the user edits a field, their number wins and the items are *expected* to stop
  summing — the edit is the whole point of the step (§4.12), so do not "fix" that
  by recomputing over them. An app whose argument is honest uncertainty cannot
  afford arithmetic that does not hold, nor a confirm step that quietly overrides
  the person confirming.
- Test data goes in and comes back out. Verifying the food loop writes real rows
  to the real Neon database under your own account; delete them when you are done
  rather than leaving your dashboard showing meals you never ate.
