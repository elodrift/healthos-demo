"use client";

export function ChipBar({
  options,
  onSelect,
}: {
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-4 pt-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          className="rounded-full border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-ink-hi transition hover:border-accent-green/60 hover:text-accent-green active:scale-[0.97]"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
