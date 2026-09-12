/**
 * Replaces the old DemoFooter, which read "Simulated demo — not medical
 * advice." The "simulated demo" half stopped being true when the scripted
 * walkthrough was deleted, but the "not medical advice" half matters more now,
 * not less: the app derives real protein and calorie targets from real
 * bloodwork and WHOOP recovery, so it needs to say plainly that it is not a
 * clinician.
 */
export function Disclaimer() {
  return (
    <footer className="border-t border-base-700 bg-base-950 px-4 py-2.5 text-center lg:border-0 lg:bg-transparent">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
        Guidance only — not medical advice.
      </p>
    </footer>
  );
}
