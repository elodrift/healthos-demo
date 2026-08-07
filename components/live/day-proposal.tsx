import type { DayProposal, Evidence } from "@/lib/planner/propose-day";

/**
 * Presentational only. Every claim is labelled with where it came from, because
 * §4.11 forbids showing an assumption in the same voice as a measurement — the
 * EVIDENCE chip is the mechanism that keeps that honest.
 */

const EVIDENCE_COPY: Record<Evidence, { label: string; detail: string }> = {
  MEASURED: {
    label: "Measured",
    detail: "Built from last night's sleep and this morning's recovery.",
  },
  PARTIAL: {
    label: "Partly measured",
    detail: "Some of WHOOP's data was missing, so parts of this are your usual pattern.",
  },
  PROFILE_ONLY: {
    label: "Assumed",
    detail: "No WHOOP data today. This is your stated routine, not a measurement.",
  },
  NONE: { label: "No data", detail: "Nothing to plan from yet." },
};

const CONTROL_COPY: Record<string, string> = {
  FULL: "Full control over food",
  PARTIAL: "Partial control over food",
  MINIMAL: "Minimal control over food",
  UNKNOWN: "Control over food not set",
};

export function DayProposalView({
  proposal,
  fromCache,
  cachedDay,
}: {
  proposal: DayProposal;
  fromCache: boolean;
  cachedDay: string | null;
}) {
  const evidence = EVIDENCE_COPY[proposal.evidence];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
            proposal.evidence === "MEASURED"
              ? "bg-accent-green/15 text-accent-green"
              : "bg-base-800 text-ink-lo"
          }`}
        >
          {evidence.label}
        </span>
        <span className="rounded-full bg-base-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          {CONTROL_COPY[proposal.controlLevel] ?? proposal.controlLevel}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-ink-lo">{evidence.detail}</p>

      {fromCache ? (
        <p className="rounded-xl border border-dashed border-base-700 p-3 text-[13px] leading-relaxed text-ink-lo">
          WHOOP could not be reached, so this uses your reading from{" "}
          <span className="font-mono text-ink-hi">{cachedDay}</span>. It is real data, just
          not today&apos;s.
        </p>
      ) : null}

      {/* The day skeleton: the frame every meal time is derived from. */}
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-base-700 bg-base-900 p-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
            Woke
          </dt>
          <dd className="mt-1 font-mono text-lg text-ink-hi">{proposal.wakeTime}</dd>
        </div>
        <div className="rounded-xl border border-base-700 bg-base-900 p-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
            Bed by
          </dt>
          <dd className="mt-1 font-mono text-lg text-ink-hi">{proposal.sleepTime}</dd>
        </div>
      </dl>

      {/* Signature element: a single time rail the whole day hangs off. */}
      <ol className="flex flex-col">
        {proposal.slots.map((slot, i) => (
          <li key={slot.sortOrder} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="font-mono text-[11px] leading-6 text-accent-green">
                {slot.slotTime}
              </span>
              {i < proposal.slots.length - 1 ? (
                <span aria-hidden="true" className="my-1 w-px flex-1 bg-base-700" />
              ) : null}
            </div>
            <div className="flex-1 pb-5">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink-hi">
                {slot.label}
              </h3>
              {/*
                The planner gives every ordinary slot the same purpose sentence.
                Repeating it verbatim down the rail turns the one line that IS
                slot-specific (pre/post-training) into more of the same noise,
                so an unchanged purpose is shown once and then suppressed.
              */}
              {slot.purpose !== proposal.slots[i - 1]?.purpose ? (
                <p className="mt-1 text-[13px] leading-relaxed text-ink-lo">{slot.purpose}</p>
              ) : null}

              {slot.oneDecision ? (
                <p className="mt-2 rounded-lg bg-base-800 px-2.5 py-2 text-[13px] leading-relaxed text-ink-hi">
                  {slot.oneDecision}
                </p>
              ) : null}

              {slot.targetProteinG !== null ||
              slot.targetCarbG !== null ||
              slot.targetKcal !== null ? (
                <p className="mt-2 font-mono text-[11px] text-ink-lo">
                  {[
                    slot.targetProteinG !== null ? `${slot.targetProteinG}g protein` : null,
                    slot.targetCarbG !== null ? `${slot.targetCarbG}g carbs` : null,
                    slot.targetKcal !== null ? `${slot.targetKcal} kcal` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {proposal.rationale.length > 0 ? (
        <section className="rounded-xl border border-base-700 bg-base-900 p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
            Why this shape
          </h2>
          <ul className="mt-2.5 flex flex-col gap-2">
            {proposal.rationale.map((line) => (
              <li key={line} className="text-[13px] leading-relaxed text-ink-lo">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* §4.12: what the system refused to decide, stated plainly. */}
      {proposal.deferrals.length > 0 ? (
        <section className="rounded-xl border border-dashed border-base-700 p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
            Not decided for you
          </h2>
          <ul className="mt-2.5 flex flex-col gap-2">
            {proposal.deferrals.map((line) => (
              <li key={line} className="text-[13px] leading-relaxed text-ink-lo">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
