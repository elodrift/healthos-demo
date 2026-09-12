/**
 * Why the plan is different from the one he saw this morning.
 *
 * First-class, not a footnote: its own card, the accent border, and the sentence
 * set at 16px — larger than the body text anywhere else on the screen. An app
 * that silently reshuffles dinner and explains itself in 11px grey has not
 * earned the reshuffle. This is the sentence that makes the replan trustworthy
 * rather than mysterious, so it is sized like it matters.
 *
 * The mechanism line beneath it is what separates this from a horoscope: it names
 * the input, the comparison and the consequence, so the claim can be checked
 * against the rows above.
 */

export function WhyChanged({ sentence, mechanism }: { sentence: string; mechanism: string }) {
  return (
    <section
      aria-labelledby="why-heading"
      className="rounded-2xl border border-accent-green/30 bg-accent-green/[0.05] p-4 sm:p-5"
    >
      <h2
        id="why-heading"
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent-green"
      >
        Why the plan changed
      </h2>
      <p className="mt-2.5 text-[16px] leading-relaxed text-ink-hi">{sentence}</p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">{mechanism}</p>
    </section>
  );
}
