import type {
  Confirmation,
  Deviation,
  Directive,
  Ledger,
  Meal,
} from "@/src/engine/derive-plan";
import { MealCard } from "./MealCard";

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  eveningSnack: "Snack",
  dinner: "Dinner",
};

export function TimelineGrid({
  directives,
  ledger,
  meals,
  displayedMeal,
  onConfirm,
  onSwap,
}: {
  directives: Directive[];
  ledger: Ledger;
  meals: Meal[];
  displayedMeal: (slotId: string, prescribed: Meal | null) => Meal | null;
  onConfirm: (slotId: string, meal: Meal) => void;
  onSwap: (slotId: string, current: Meal | null) => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
          Four structural Slots
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {directives.map((directive) => {
          const entry = ledger.find((row) => row.slotId === directive.slotId) as
            | Confirmation
            | Deviation
            | undefined;
          const confirmedMeal =
            entry?.kind === "confirmation"
              ? (meals.find((meal) => meal.id === entry.mealId) ?? null)
              : null;

          return (
            <MealCard
              key={directive.slotId}
              title={SLOT_LABELS[directive.slotId] ?? directive.slotId}
              directive={directive}
              meal={displayedMeal(directive.slotId, directive.meal)}
              ledgerEntry={entry}
              confirmedMeal={confirmedMeal}
              onConfirm={() => {
                const meal = displayedMeal(directive.slotId, directive.meal);
                if (meal) onConfirm(directive.slotId, meal);
              }}
              onSwap={() =>
                onSwap(
                  directive.slotId,
                  displayedMeal(directive.slotId, directive.meal),
                )
              }
            />
          );
        })}
      </div>
    </section>
  );
}
