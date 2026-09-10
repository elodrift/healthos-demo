import type {
  Confirmation,
  Deviation,
  Directive,
  Meal,
} from "@/src/engine/derive-plan";

const mealLabel = (id: string) =>
  id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();

const MacroRow = ({
  protein,
  carbohydrate,
  fat,
}: {
  protein: number;
  carbohydrate: number;
  fat: number;
}) => (
  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
    {[
      ["P", protein],
      ["C", carbohydrate],
      ["F", fat],
    ].map(([key, value]) => (
      <div key={String(key)} className="rounded-xl bg-stone-50 py-2">
        <dt className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          {key}
        </dt>
        <dd className="text-sm font-semibold tabular-nums">
          {Math.round(Number(value))}g
        </dd>
      </div>
    ))}
  </dl>
);

export function MealCard({
  title,
  directive,
  meal,
  ledgerEntry,
  confirmedMeal,
  onConfirm,
  onSwap,
}: {
  title: string;
  directive: Directive;
  meal: Meal | null;
  ledgerEntry: Confirmation | Deviation | undefined;
  confirmedMeal: Meal | null;
  onConfirm: () => void;
  onSwap: () => void;
}) {
  const spent = Boolean(ledgerEntry);
  const upcoming = !spent && directive.meal !== null;
  const unreachable = directive.state === "closestAchievable";

  const shownMeal =
    ledgerEntry?.kind === "confirmation" ? confirmedMeal : meal;

  return (
    <article className="flex flex-col rounded-3xl bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.04)] ring-1 ring-stone-200/80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-zinc-400">{directive.at}</p>
          <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h3>
        </div>
        {unreachable && upcoming ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200/80">
            Target Unreachable
          </span>
        ) : null}
        {ledgerEntry?.kind === "confirmation" ? (
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200/80">
            Confirmed
          </span>
        ) : null}
        {ledgerEntry?.kind === "deviation" ? (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600 ring-1 ring-stone-200">
            Deviation logged
          </span>
        ) : null}
        {directive.state === "unactioned" ? (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-stone-200">
            Unactioned
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-sm font-medium text-zinc-800">
        {shownMeal
          ? mealLabel(shownMeal.id)
          : ledgerEntry?.kind === "deviation"
            ? "Off-menu Footprint"
            : directive.state === "unactioned"
              ? "Share released forward"
              : "Awaiting Directive"}
      </p>

      {shownMeal ? (
        <MacroRow {...shownMeal.footprint} />
      ) : ledgerEntry?.kind === "deviation" ? (
        <MacroRow {...ledgerEntry.footprint} />
      ) : (
        <MacroRow {...directive.targets} />
      )}

      <p className="mt-3 text-xs text-zinc-400">
        Slot Targets {Math.round(directive.targets.protein)} /{" "}
        {Math.round(directive.targets.carbohydrate)} /{" "}
        {Math.round(directive.targets.fat)} g
      </p>

      {upcoming ? (
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-teal-800 px-4 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-teal-700"
          >
            ✅ Confirm
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
          >
            🔄 Swap Meal
          </button>
        </div>
      ) : (
        <p className="mt-5 text-xs leading-5 text-zinc-400">
          {spent
            ? "This Slot is on the Ledger. Remaining Slots carry the Headroom."
            : "The clock has moved on. This share now sits with what is still ahead."}
        </p>
      )}
    </article>
  );
}
