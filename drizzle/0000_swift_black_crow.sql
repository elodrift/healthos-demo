-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "chat_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"mealLogId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendship" (
	"id" serial PRIMARY KEY NOT NULL,
	"requesterId" text NOT NULL,
	"addresseeId" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"respondedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wearable_connection" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"providerUserId" text,
	"accessToken" text NOT NULL,
	"refreshToken" text,
	"expiresAt" timestamp,
	"scope" text,
	"lastSyncedAt" timestamp,
	"syncError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wearable_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"recoveryScore" integer,
	"hrvMs" real,
	"restingHr" integer,
	"sleepPerformance" integer,
	"sleepDurationMin" integer,
	"sleepStart" timestamp,
	"sleepEnd" timestamp,
	"strain" real,
	"kcalBurned" integer,
	"raw" jsonb,
	"fetchedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"dayPlanId" integer NOT NULL,
	"slotTime" text NOT NULL,
	"label" text NOT NULL,
	"purpose" text,
	"targetProteinG" integer,
	"targetCarbG" integer,
	"targetKcal" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"day" date NOT NULL,
	"mealSlotId" integer,
	"loggedAt" timestamp DEFAULT now() NOT NULL,
	"description" text,
	"photoPathname" text,
	"photoWidth" integer,
	"photoHeight" integer,
	"proteinG" real,
	"carbG" real,
	"fatG" real,
	"kcal" real,
	"confidence" text DEFAULT 'MEDIUM' NOT NULL,
	"estimated" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"placeName" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"note" text,
	"plannedFor" timestamp,
	"sharedWithFriends" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"goal" text,
	"proteinTargetG" integer,
	"carbTargetG" integer,
	"kcalTarget" integer,
	"typicalWakeTime" text,
	"typicalSleepTime" text,
	"mealsPerDay" integer,
	"medicalNotes" text,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"objective" text,
	"targetDate" date,
	"goalMode" text,
	"controlLevel" text DEFAULT 'UNKNOWN' NOT NULL,
	"eatingOutFrequency" text,
	"foodPreferences" text,
	"trainingSchedule" text,
	"supplementStack" text,
	"proteinFloorG" integer,
	"baselineCapturedAt" timestamp,
	CONSTRAINT "onboarding_profile_userId_key" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "baseline_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" text NOT NULL,
	"fileUrl" text NOT NULL,
	"fileName" text,
	"contentType" text,
	"sizeBytes" integer,
	"uploadedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"day" date NOT NULL,
	"wakeTime" text,
	"sleepTime" text,
	"trainingStart" text,
	"trainingEnd" text,
	"trainingType" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposedBy" text DEFAULT 'agent' NOT NULL,
	"rationale" text,
	"confirmedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"controlLevel" text DEFAULT 'UNKNOWN' NOT NULL,
	"evidence" text DEFAULT 'NONE' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_user_created_idx" ON "chat_message" USING btree ("userId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "friendship_pair_idx" ON "friendship" USING btree (LEAST("requesterId", "addresseeId") text_ops,GREATEST("requesterId", "addresseeId") text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "wearable_connection_user_provider_idx" ON "wearable_connection" USING btree ("userId" text_ops,"provider" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "wearable_daily_user_provider_day_idx" ON "wearable_daily" USING btree ("userId" date_ops,"provider" text_ops,"day" text_ops);--> statement-breakpoint
CREATE INDEX "meal_slot_user_plan_idx" ON "meal_slot" USING btree ("userId" int4_ops,"dayPlanId" int4_ops);--> statement-breakpoint
CREATE INDEX "meal_log_user_day_idx" ON "meal_log" USING btree ("userId" date_ops,"day" date_ops);--> statement-breakpoint
CREATE INDEX "check_in_user_created_idx" ON "check_in" USING btree ("userId" text_ops,"createdAt" text_ops);--> statement-breakpoint
CREATE INDEX "baseline_document_user_idx" ON "baseline_document" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "day_plan_user_day_idx" ON "day_plan" USING btree ("userId" date_ops,"day" date_ops);
*/