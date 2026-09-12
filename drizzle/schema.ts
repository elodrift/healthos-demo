import { pgTable, index, serial, text, integer, timestamp, uniqueIndex, unique, boolean, foreignKey, date, real, jsonb, doublePrecision } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const chatMessage = pgTable("chat_message", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	role: text().notNull(),
	text: text().notNull(),
	source: text().default('local').notNull(),
	mealLogId: integer(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("chat_message_user_created_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
]);

export const friendship = pgTable("friendship", {
	id: serial().primaryKey().notNull(),
	requesterId: text().notNull(),
	addresseeId: text().notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	respondedAt: timestamp({ mode: 'string' }),
}, (table) => [
	uniqueIndex("friendship_pair_idx").using("btree", sql`LEAST("requesterId", "addresseeId")`, sql`GREATEST("requesterId", "addresseeId")`),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean().default(false).notNull(),
	image: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_email_key").on(table.email),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	ipAddress: text(),
	userAgent: text(),
	userId: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_userId_fkey"
		}).onDelete("cascade"),
	unique("session_token_key").on(table.token),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: text().notNull(),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: timestamp({ mode: 'string' }),
	refreshTokenExpiresAt: timestamp({ mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_userId_fkey"
		}).onDelete("cascade"),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow(),
});

export const wearableConnection = pgTable("wearable_connection", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	provider: text().notNull(),
	providerUserId: text(),
	accessToken: text().notNull(),
	refreshToken: text(),
	expiresAt: timestamp({ mode: 'string' }),
	scope: text(),
	lastSyncedAt: timestamp({ mode: 'string' }),
	syncError: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("wearable_connection_user_provider_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.provider.asc().nullsLast().op("text_ops")),
]);

export const wearableDaily = pgTable("wearable_daily", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	provider: text().notNull(),
	day: date().notNull(),
	recoveryScore: integer(),
	hrvMs: real(),
	restingHr: integer(),
	sleepPerformance: integer(),
	sleepDurationMin: integer(),
	sleepStart: timestamp({ mode: 'string' }),
	sleepEnd: timestamp({ mode: 'string' }),
	strain: real(),
	kcalBurned: integer(),
	raw: jsonb(),
	fetchedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("wearable_daily_user_provider_day_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.provider.asc().nullsLast().op("text_ops"), table.day.asc().nullsLast().op("text_ops")),
]);

export const mealSlot = pgTable("meal_slot", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	dayPlanId: integer().notNull(),
	slotTime: text().notNull(),
	label: text().notNull(),
	purpose: text(),
	targetProteinG: integer(),
	targetCarbG: integer(),
	targetKcal: integer(),
	status: text().default('planned').notNull(),
	sortOrder: integer().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("meal_slot_user_plan_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.dayPlanId.asc().nullsLast().op("int4_ops")),
]);

export const mealLog = pgTable("meal_log", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	day: date().notNull(),
	mealSlotId: integer(),
	loggedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	description: text(),
	photoPathname: text(),
	photoWidth: integer(),
	photoHeight: integer(),
	proteinG: real(),
	carbG: real(),
	fatG: real(),
	kcal: real(),
	confidence: text().default('MEDIUM').notNull(),
	estimated: boolean().default(true).notNull(),
	source: text().default('manual').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("meal_log_user_day_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.day.asc().nullsLast().op("date_ops")),
]);

export const checkIn = pgTable("check_in", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	placeName: text().notNull(),
	lat: doublePrecision(),
	lon: doublePrecision(),
	note: text(),
	plannedFor: timestamp({ mode: 'string' }),
	sharedWithFriends: boolean().default(false).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("check_in_user_created_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
]);

export const onboardingProfile = pgTable("onboarding_profile", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	goal: text(),
	proteinTargetG: integer(),
	carbTargetG: integer(),
	kcalTarget: integer(),
	typicalWakeTime: text(),
	typicalSleepTime: text(),
	mealsPerDay: integer(),
	medicalNotes: text(),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	objective: text(),
	targetDate: date(),
	goalMode: text(),
	controlLevel: text().default('UNKNOWN').notNull(),
	eatingOutFrequency: text(),
	foodPreferences: text(),
	trainingSchedule: text(),
	supplementStack: text(),
	proteinFloorG: integer(),
	baselineCapturedAt: timestamp({ mode: 'string' }),
}, (table) => [
	unique("onboarding_profile_userId_key").on(table.userId),
]);

export const baselineDocument = pgTable("baseline_document", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	kind: text().notNull(),
	fileUrl: text().notNull(),
	fileName: text(),
	contentType: text(),
	sizeBytes: integer(),
	uploadedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("baseline_document_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const dayPlan = pgTable("day_plan", {
	id: serial().primaryKey().notNull(),
	userId: text().notNull(),
	day: date().notNull(),
	wakeTime: text(),
	sleepTime: text(),
	trainingStart: text(),
	trainingEnd: text(),
	trainingType: text(),
	status: text().default('proposed').notNull(),
	proposedBy: text().default('agent').notNull(),
	rationale: text(),
	confirmedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	controlLevel: text().default('UNKNOWN').notNull(),
	evidence: text().default('NONE').notNull(),
}, (table) => [
	uniqueIndex("day_plan_user_day_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.day.asc().nullsLast().op("date_ops")),
]);
