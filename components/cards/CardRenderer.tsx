"use client";

import { motion } from "framer-motion";
import { CardShell } from "./CardShell";
import { TargetRevisionCard } from "./TargetRevisionCard";
import { ProposalsCard } from "./ProposalsCard";
import type { CardSpec } from "@/lib/fixtures/script-types";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M4 12.5l5 5L20 6.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CardRenderer({
  card,
  beatId,
  highlighted,
  onHover,
}: {
  card: CardSpec;
  /** the beat that produced this card — keys the user's proposal decision */
  beatId: string;
  highlighted?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  switch (card.type) {
    case "planned-variance":
      return (
        <CardShell eyebrow={card.tag} highlighted={highlighted} onHover={onHover} accent="green">
          <p className="text-lg font-semibold leading-snug text-ink-hi">
            {card.headline}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-mid">{card.body}</p>
        </CardShell>
      );

    // The ONLY red surface in the app.
    case "never-suspends":
      return (
        <CardShell eyebrow={card.tag} highlighted={highlighted} onHover={onHover} accent="red">
          <ul className="flex flex-col gap-1.5">
            {card.rules.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[13px] font-medium text-ink-hi">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-red" />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-accent-red/20 pt-3 text-[13px] leading-relaxed text-ink-mid">
            {card.body}
          </p>
        </CardShell>
      );

    case "proposals":
      return (
        <ProposalsCard
          beatId={beatId}
          items={card.items}
          highlighted={highlighted}
          onHover={onHover}
        />
      );

    case "meal-push":
      return (
        <CardShell eyebrow="12:30 · Meal" highlighted={highlighted} onHover={onHover}>
          <p className="text-[15px] font-semibold leading-snug text-ink-hi">{card.title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-accent-green">{card.why}</p>
        </CardShell>
      );

    case "target-revision":
      return (
        <TargetRevisionCard
          causeTag={card.causeTag}
          rows={card.rows}
          lockNote={card.lockNote}
          highlighted={highlighted}
          onHover={onHover}
        />
      );

    case "morning-untouched":
      return (
        <CardShell
          eyebrow="Already eaten · not re-scored"
          highlighted={highlighted}
          onHover={onHover}
          accent="green"
        >
          <ul className="flex flex-col gap-2">
            {card.meals.map((m, i) => (
              <motion.li
                key={m}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="flex items-center gap-2 rounded-lg border border-accent-green/25 bg-accent-green/10 px-3 py-2 text-[13px] text-ink-hi"
              >
                <span className="text-accent-green">
                  <CheckIcon />
                </span>
                {m}
              </motion.li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">{card.caption}</p>
        </CardShell>
      );

    case "estimate":
      return (
        <CardShell
          eyebrow="Estimate · unplanned meal"
          highlighted={highlighted}
          onHover={onHover}
          accent="estimate"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-dashed border-base-500 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
              Confidence: {card.confidence}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-mid">{card.label}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-base-700 bg-base-800/70 px-3 py-2.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-lo">Kcal</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink-hi">
                {card.kcalRange[0]}–{card.kcalRange[1]}
              </div>
            </div>
            <div className="rounded-xl border border-base-700 bg-base-800/70 px-3 py-2.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-lo">Protein</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink-hi">
                {card.proteinRange[0]}–{card.proteinRange[1]}g
              </div>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-mid">{card.note}</p>
        </CardShell>
      );

    case "evening-status":
      return (
        <CardShell
          eyebrow="19:00 · Status"
          highlighted={highlighted}
          onHover={onHover}
          accent={card.tone}
        >
          <span
            className={`inline-block rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${
              card.tone === "estimate"
                ? "border border-dashed border-base-500 text-ink-mid"
                : "border border-accent-green/50 bg-accent-green/15 text-accent-green"
            }`}
          >
            {card.label}
          </span>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">{card.body}</p>
        </CardShell>
      );

    case "day-close": {
      const cols: Array<{ head: string; items: string[]; tone: string }> = [
        { head: "Known", items: card.summary.known, tone: "text-accent-green" },
        { head: "Uncertain", items: card.summary.uncertain, tone: "text-ink-lo" },
        { head: "What mattered", items: card.summary.whatMattered, tone: "text-ink-hi" },
      ];
      return (
        <CardShell eyebrow="21:00 · Day close" highlighted={highlighted} onHover={onHover}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cols.map((col) => (
              <div key={col.head} className="rounded-xl border border-base-700 bg-base-800/60 p-3">
                <div className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${col.tone}`}>
                  {col.head}
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {col.items.map((item) => (
                    <li key={item} className="text-[12px] leading-relaxed text-ink-mid">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardShell>
      );
    }
  }
}
