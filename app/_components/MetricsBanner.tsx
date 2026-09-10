import type { Plan } from "@/src/engine/derive-plan";

const CHOLESTEROL_CAP = 15;

function Ring({
  label,
  caption,
  value,
  max,
  unit,
  accent,
}: {
  label: string;
  caption: string;
  value: number;
  max: number;
  unit: string;
  accent: string;
}) {
  const size = 132;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const innerRadius = radius - 14;
  const circumference = 2 * Math.PI * radius;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const offset = circumference * (1 - ratio);
  const innerOffset = innerCircumference * (1 - ratio);

  return (
    <div className="flex items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e7e5e4"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke="#f5f5f4"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke={accent}
          strokeOpacity={0.35}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={innerCircumference}
          strokeDashoffset={innerOffset}
        />
      </svg>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
          {Math.round(value)}
          <span className="ml-1 text-base font-medium text-zinc-500">{unit}</span>
        </p>
        <p className="mt-1 text-sm text-zinc-600">{caption}</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          of {Math.round(max)} {unit} remaining
        </p>
      </div>
    </div>
  );
}

const chip = (label: string, value: number, unit: string) => (
  <div
    key={label}
    className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-stone-200/80"
  >
    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
      {label}
    </p>
    <p className="mt-1 text-xl font-semibold tabular-nums">
      {Math.round(value)}
      <span className="ml-1 text-xs font-medium text-zinc-500">{unit}</span>
    </p>
  </div>
);

export function MetricsBanner({ plan }: { plan: Plan }) {
  const carbRemaining = plan.headroom.macros.carbohydrate;
  const capRemaining = plan.headroom.caps.saturatedFat;

  return (
    <section className="rounded-3xl bg-gradient-to-br from-stone-100 via-stone-50 to-teal-50/60 p-6 shadow-[0_1px_0_rgba(28,25,23,0.04)] ring-1 ring-stone-200/70 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
        <Ring
          label="Glycaemic Load Ring"
          caption="Carbohydrate Headroom still on the board"
          value={Math.max(0, carbRemaining)}
          max={plan.targets.carbohydrate}
          unit="g"
          accent="#0f766e"
        />
        <Ring
          label="Biomarker Protection Score"
          caption="Saturated fat Cap still obeyed"
          value={capRemaining}
          max={CHOLESTEROL_CAP}
          unit="g"
          accent="#115e59"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          {chip("Protein", plan.headroom.macros.protein, "g")}
          {chip("Carbs", plan.headroom.macros.carbohydrate, "g")}
          {chip("Fat", plan.headroom.macros.fat, "g")}
          {chip("Sat fat Cap", plan.headroom.caps.saturatedFat, "g")}
        </div>
      </div>
    </section>
  );
}
