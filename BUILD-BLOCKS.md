# BUILD BLOCKS — how work happens on this project

## ACTIVE BLOCK: 1

**One block at a time. Nothing outside the active block gets built, fixed, tidied, or
"quickly improved while I'm in here."**

If you are asked to do work that is not in the active block, STOP and say:
*"That belongs to Block N. The active block is 0. Do you want to change the active block?"*
Changing the active block is a founder decision. It is one line in this file.

---

## The rule that was missing

**Blocks are vertical, never horizontal.** A block delivers something a person can
experience end to end, on a phone, in one sentence. It is never a component, a layer,
or a hardening pass.

"Make the confirmation card honest" is not a block — it is maintenance on a surface.
Four weeks went into work of that shape. Every slice was correct. None of them moved
the product, because none of them was a block.

**A block is done when you can demonstrate it — not when tests pass, not when a review
clears, not when it merges.** If you cannot show it working on a phone in under a
minute, it is not done.

---

## The blocks, in order

**0 — SEE WHAT EXISTS** *(a gate, not a build — no code)*
Open `/live`, sign in, connect WHOOP, set a goal. Look at it.
**Done when:** you can say out loud what the screen currently does and does not do.
*Nothing below can be planned honestly until this is known.*

**1 — ONE BRAIN, ONE LEDGER**
Engine read API. `/live` renders from it. `propose-day.ts` deleted. One meal ledger wins.
**Demo:** "I log a meal in one place and see it reflected in the other."
*This is the join. Two systems become one product here.*

**2 — HONEST LOGGING**
Plan-aware meal reconciliation (Decision 24) and the precision hierarchy.
**Demo:** "I say I ate most of my planned breakfast, and it does not invent 12g of protein."

**3 — THE DAY ADAPTS**
WHOOP reaches the engine. `goalMode` becomes a policy switch, not a stored label.
Mid-day re-plan on deviation.
**Demo:** "Today's plan is different from yesterday's, and it tells me why."

**4 — THE SCENARIOS PASS**
`PRODUCT_DNA.md` §5, scenarios S1–S8, each with a test that names it.
**Demo:** "Throw any row of the matrix at it at a random time and it copes."
*This is the DNA's own definition of done for the orchestration layer. It has never been run.*

**5 — STRANGERS USE IT**
GIMBAL brand, waitlist, Level Check tool, the content calendar that has been waiting
in the vault since 9 July.
**Demo:** "Someone I have never met is using it and I can see their retention."

---

## Inside a block, always this order

1. **Grill** — `/grill-with-docs` on the slice before any code. Thirty minutes.
2. **Build** — one slice, tests with it.
3. **One review** — engine, ledger or safety changes only. Never docs, never screens.
4. **Demo** — on a phone. If you cannot, it is not done.
5. **Close** — the block moves; the file's ACTIVE BLOCK line changes.

A defect that cannot happen in production is a backlog row, not a blocker.
Agents decide code. The founder decides product and safety.

---

## Frozen while any block is active

Telegram feature work · anything in `IDEAS-BACKLOG.md` Tier 2–4 · the body-scan visual ·
supplements · the social layer · anything not named in the active block above.

They are all real. None of them is the active block.
