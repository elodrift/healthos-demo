# The Plan is a derived projection, not stored state

A Plan is computed by a pure function — `derivePlan(profile, ledger, now) -> Plan` — every time it is read. The only durable facts are the Profile and the append-only Ledger of Confirmations and Deviations. A Reroute is not an operation that mutates anything; it is what the same function returns once a new Deviation is in the Ledger.

## Considered options

**Storing today's Plan as a mutable record** and having Reroute update it in place is the obvious shape, and it was rejected for two reasons. It destroys evidence: overwriting a Directive erases what was originally prescribed, which is exactly the comparison a Deviation is defined against. And it makes the core of the system a state machine over time, which cannot be tested without fixtures, ordering assumptions, and time mocking — whereas a pure function needs only an injected clock.

## Consequences

- **The store only ever appends.** Swapping the static Profile file for a multi-Athlete database becomes close to mechanical, since no code holds mutable Plan state to migrate.
- **Derivation rules apply retroactively.** Re-reading an old day runs today's rules over that day's Ledger, so past Plans will change as the engine evolves. If historical Plans ever need to be stable — for trend analysis or for showing the Athlete what they were actually told — they must be explicitly snapshotted. Nothing in this design preserves them by default.
- **The clock is an input, never an ambient read.** No module below the entry point may call `Date.now()`; the current time is passed in. This is what makes "what does the day look like at 14:30 after a 13:00 Deviation" a plain unit test.
