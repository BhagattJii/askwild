CREATE TABLE "user_preferences" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"response_language" varchar(16) DEFAULT 'auto' NOT NULL,
	"autosuggest" boolean DEFAULT true NOT NULL,
	"bio" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_all_own_preferences" ON "user_preferences" AS PERMISSIVE FOR ALL TO public USING (user_id = (select current_setting('app.current_user_id', true))) WITH CHECK (user_id = (select current_setting('app.current_user_id', true)));