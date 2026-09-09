# The Ledger persists as an append-only local file

For the MVP the Ledger is an array of Confirmations and Deviations written to a `ledger.json` file on disk, read at the entry point and handed to `derivePlan` as a plain array. The store exposes append and read, and nothing else — no update, no delete — which is the whole of what ADR-0002 requires of it.

## Considered options

**Keeping the Ledger in React state only** was rejected because the day would not survive a reload, and a day the Athlete cannot close the app on is not one they will use. **Provisioning a database now** was rejected as infrastructure bought ahead of any need: there is one Athlete, no concurrency, and no query beyond "read the whole day".

## Consequences

- **The engine stays ignorant of the store.** `derivePlan` receives an array; nothing below the entry point knows a file exists. This is what keeps the single test seam viable and what makes the eventual swap for a database close to mechanical, exactly as ADR-0002 anticipated.
- **A file is not a database, and the gap will show under concurrency.** Two writes racing can lose a row, since append is a read-modify-write with no locking. Acceptable for one Athlete on one device; it is the first thing to break if that assumption ever changes.
- **Nothing prunes.** The file grows without bound and is read in full on every derivation. Irrelevant at one day of rows, and a real constraint long before it is a performance one — the point at which reading the whole Ledger stops being reasonable is the point this ADR is superseded.
- **The file is the system of record.** With the Plan derived rather than stored, `ledger.json` plus the Profile is the entire durable state of HealthOS. It deserves to be backed up, and it must not be edited by hand — a rewritten row silently rewrites history that ADR-0002 assumes is immutable.
