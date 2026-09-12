/**
 * How a number looks, and how it admits what it is.
 *
 * The confidence treatment is the brand, so it gets to be handsome rather than
 * apologetic: a weighed figure is set in the bright ink with a quiet green chip,
 * an estimate is set in the same size with a tilde, an en-dashed range and a
 * neutral chip. Neither is styled as a warning. An estimate is not a lesser
 * number, it is a differently-known one, and the palette says so — accent-red is
 * reserved for the medical safety card and appears nowhere on this screen.
 */

import { formatAmount, knowledgeOf, KNOWLEDGE_LABEL, type Amount } from "@/lib/today/fixture";

export function KnowledgeChip({ amount, className = "" }: { amount: Amount; className?: string }) {
  const k = knowledgeOf(amount);
  const measured = k === "weighed";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-[3px] font-mono text-[10px] uppercase leading-none tracking-[0.12em] ${
        measured ? "bg-accent-green/12 text-accent-green" : "bg-base-800 text-ink-lo"
      } ${className}`}
    >
      {KNOWLEDGE_LABEL[k]}
    </span>
  );
}

/**
 * A macro figure with its unit and, optionally, its chip.
 *
 * `srLabel` matters: a screen reader hitting "~30–36g" with the chip rendered
 * separately can lose the association between the number and its uncertainty, so
 * the whole claim is restated once, invisibly, as a sentence.
 */
export function AmountValue({
  amount,
  label,
  size = "md",
  withChip = true,
}: {
  amount: Amount;
  label: string;
  size?: "sm" | "md" | "lg";
  withChip?: boolean;
}) {
  const text = formatAmount(amount);
  const k = knowledgeOf(amount);
  const sr =
    amount.known === "exact"
      ? `${amount.g} grams of ${label}, ${amount.via === "weighed" ? "weighed" : "exact from the label"}`
      : `between ${amount.lowG} and ${amount.highG} grams of ${label}, estimated`;

  const sizes = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "text-[26px]",
  } as const;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="sr-only">{sr}</span>
      <span
        aria-hidden="true"
        className={`font-mono tabular-nums leading-none ${sizes[size]} ${
          k === "estimated" ? "text-ink-mid" : "text-ink-hi"
        }`}
      >
        {text}
      </span>
      {withChip ? <KnowledgeChip amount={amount} /> : null}
    </span>
  );
}
