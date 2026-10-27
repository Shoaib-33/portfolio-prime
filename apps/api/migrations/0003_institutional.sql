CREATE TABLE "sale_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"stages" jsonb NOT NULL,
	"min_ticket" integer,
	"advisor" text,
	"shortlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"user_id" uuid,
	"category" text DEFAULT 'General' NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"listing_slug" text,
	"question" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_processes" ADD CONSTRAINT "sale_processes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_processes_listing_idx" ON "sale_processes" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "qa_listing_idx" ON "qa_items" USING btree ("listing_id");
