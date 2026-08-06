"use client";

export function TimelineScrubber({
  total,
  current,
  onScrub,
  autoplay,
  onToggleAutoplay,
}: {
  total: number;
  current: number;
  onScrub: (index: number) => void;
  autoplay: boolean;
  onToggleAutoplay: (v: boolean) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-2 border-b border-base-700 px-4 py-2">
      <button
        onClick={() => onToggleAutoplay(!autoplay)}
        aria-label={autoplay ? "Pause" : "Play"}
        className="shrink-0 text-xs text-ink-lo hover:text-ink-hi"
      >
        {autoplay ? "⏸" : "▶"}
      </button>
      <div className="flex flex-1 items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            aria-label={`Replay from beat ${i + 1}`}
            onClick={() => onScrub(i + 1)}
            className={`h-1.5 min-w-[5px] flex-1 rounded-full transition-colors ${
              i < current ? "bg-accent-green/70" : "bg-base-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
