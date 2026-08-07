import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------------------
 * Better Auth tables — column names are Better Auth's defaults (camelCase).
 * Do not rename them.
 * ------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

/* ---------------------------------------------------------------------------
 * App tables. Plain `userId` column for per-query scoping, no FK constraints
 * (there is no RLS on Neon — every query must filter by userId itself).
 * ------------------------------------------------------------------------- */

/**
 * One row per user per wearable provider.
 *
 * This table is the reason the project needed a database at all. WHOOP rotates
 * the refresh token on EVERY exchange and invalidates the previous one
 * immediately, so tokens cannot live in localStorage or the user would be
 * re-authorising constantly. `refreshToken` here is the single source of truth
 * and must be overwritten inside the same transaction that consumes it.
 *
 * `syncError` holds the last failure verbatim so the UI can say what actually
 * broke instead of showing a generic "not connected" state (DNA §4.11 —
 * never fake certainty, including about our own failures).
 */
export const wearableConnection = pgTable(
  "wearable_connection",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    /** "whoop" today; "oura" / "terra" are the planned second providers */
    provider: text("provider").notNull(),
    providerUserId: text("providerUserId"),
    accessToken: text("accessToken").notNull(),
    refreshToken: text("refreshToken"),
    expiresAt: timestamp("expiresAt"),
    scope: text("scope"),
    lastSyncedAt: timestamp("lastSyncedAt"),
    syncError: text("syncError"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    userProvider: uniqueIndex("wearable_connection_user_provider_idx").on(
      t.userId,
      t.provider,
    ),
  }),
);

/**
 * Daily rollup of what the wearable reported, one row per user/provider/day.
 *
 * `raw` keeps the original payload so a later schema change can backfill from
 * stored truth instead of re-hitting a rate-limited API.
 */
export const wearableDaily = pgTable(
  "wearable_daily",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    provider: text("provider").notNull(),
    day: date("day").notNull(),
    recoveryScore: integer("recoveryScore"),
    hrvMs: real("hrvMs"),
    restingHr: integer("restingHr"),
    sleepPerformance: integer("sleepPerformance"),
    sleepDurationMin: integer("sleepDurationMin"),
    sleepStart: timestamp("sleepStart"),
    sleepEnd: timestamp("sleepEnd"),
    strain: real("strain"),
    kcalBurned: integer("kcalBurned"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetchedAt").notNull().defaultNow(),
  },
  (t) => ({
    userProviderDay: uniqueIndex("wearable_daily_user_provider_day_idx").on(
      t.userId,
      t.provider,
      t.day,
    ),
  }),
);

/** Answers captured once during onboarding. */
export const onboardingProfile = pgTable("onboarding_profile", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  goal: text("goal"),
  proteinTargetG: integer("proteinTargetG"),
  carbTargetG: integer("carbTargetG"),
  kcalTarget: integer("kcalTarget"),
  typicalWakeTime: text("typicalWakeTime"),
  typicalSleepTime: text("typicalSleepTime"),
  mealsPerDay: integer("mealsPerDay"),
  medicalNotes: text("medicalNotes"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * The shape of one day: when you woke, when you train, when you sleep.
 *
 * `status` is the DNA §4.12 hinge. WHOOP infers a skeleton from last night's
 * sleep and today's strain and writes it as "proposed"; nothing downstream
 * treats it as fact until the user confirms it and status becomes "confirmed".
 * `rationale` records WHY the agent proposed these times, so the proposal can
 * be argued with rather than merely accepted.
 */
export const dayPlan = pgTable(
  "day_plan",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    day: date("day").notNull(),
    wakeTime: text("wakeTime"),
    sleepTime: text("sleepTime"),
    trainingStart: text("trainingStart"),
    trainingEnd: text("trainingEnd"),
    trainingType: text("trainingType"),
    /** "proposed" | "confirmed" | "edited" */
    status: text("status").notNull().default("proposed"),
    /** "agent" | "user" — who authored the current values */
    proposedBy: text("proposedBy").notNull().default("agent"),
    rationale: text("rationale"),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    userDay: uniqueIndex("day_plan_user_day_idx").on(t.userId, t.day),
  }),
);

/** A planned eating window inside a day_plan. Intent, not a log. */
export const mealSlot = pgTable(
  "meal_slot",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    dayPlanId: integer("dayPlanId").notNull(),
    /** "HH:MM" local to the user's day, not a timestamp */
    slotTime: text("slotTime").notNull(),
    label: text("label").notNull(),
    purpose: text("purpose"),
    targetProteinG: integer("targetProteinG"),
    targetCarbG: integer("targetCarbG"),
    targetKcal: integer("targetKcal"),
    /** "planned" | "eaten" | "skipped" */
    status: text("status").notNull().default("planned"),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userPlan: index("meal_slot_user_plan_idx").on(t.userId, t.dayPlanId),
  }),
);

/**
 * A meal that actually happened. Separate from mealSlot on purpose: a plan is
 * not a log, and only rows here are allowed to move the macro header.
 *
 * `estimated` + `confidence` stay qualitative (LOW/MEDIUM/HIGH) rather than a
 * fake percentage — §4.11 forbids inventing precision we do not have.
 */
export const mealLog = pgTable(
  "meal_log",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    day: date("day").notNull(),
    mealSlotId: integer("mealSlotId"),
    loggedAt: timestamp("loggedAt").notNull().defaultNow(),
    description: text("description"),
    photoUrl: text("photoUrl"),
    photoWidth: integer("photoWidth"),
    photoHeight: integer("photoHeight"),
    proteinG: real("proteinG"),
    carbG: real("carbG"),
    fatG: real("fatG"),
    kcal: real("kcal"),
    /** "LOW" | "MEDIUM" | "HIGH" */
    confidence: text("confidence").notNull().default("MEDIUM"),
    estimated: boolean("estimated").notNull().default(true),
    /** "manual" | "photo" | "import" */
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userDay: index("meal_log_user_day_idx").on(t.userId, t.day),
  }),
);
