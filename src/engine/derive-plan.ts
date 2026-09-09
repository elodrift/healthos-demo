/**
 * A time of day in 24-hour `HH:MM`. A Plan covers exactly one day, so a
 * Directive is placed by its time of day rather than by a full timestamp.
 */
export type TimeOfDay = string;

/** One of the fixed structural blocks the Athlete's day is divided into. */
export interface Slot {
  id: string;
  at: TimeOfDay;
}

/** The durable facts HealthOS plans from. */
export interface Profile {
  slots: Slot[];
}

/** One prescribed action placed at a time in a Plan. */
export interface Directive {
  slotId: string;
  at: TimeOfDay;
}

/** The full set of Directives for one day, ordered in time. */
export interface Plan {
  directives: Directive[];
}

/** The append-only record of every Confirmation and Deviation. */
export type Ledger = never[];

/**
 * Derives the Plan for the day containing `now`. Pure: the same Profile,
 * Ledger and clock always produce the same Plan (ADR-0002).
 *
 * `now` is not yet consumed — nothing in this cycle depends on the hour.
 */
export const derivePlan = (
  profile: Profile,
  ledger: Ledger,
  now: Date,
): Plan => {
  const directives = [...profile.slots]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((slot) => ({ slotId: slot.id, at: slot.at }));

  return { directives };
};
