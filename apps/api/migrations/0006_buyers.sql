-- Buyers & outreach: companies from the Kadaster/BAG ownership exports, their buildings, contact persons and email campaigns.
CREATE TABLE "buyer_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"buyer_group" text,
	"legal_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buildings" integer DEFAULT 0 NOT NULL,
	"total_m2" bigint DEFAULT 0 NOT NULL,
	"first_purchase" date,
	"last_purchase" date,
	"avg_years" double precision,
	"recent_count" integer DEFAULT 0 NOT NULL,
	"long_count" integer DEFAULT 0 NOT NULL,
	"segment" text,
	"cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"source_file" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_companies_name_idx" ON "buyer_companies" USING btree ("name_key");--> statement-breakpoint
CREATE TABLE "buyer_buildings" (
	"bag_pand_id" text PRIMARY KEY NOT NULL,
	"street" text,
	"number" text,
	"postcode" text,
	"city" text,
	"municipality" text,
	"province" text,
	"multiple_addresses" boolean DEFAULT false NOT NULL,
	"use_purpose" text,
	"floor_m2" integer,
	"plot_m2" integer,
	"build_year" integer,
	"monument" boolean DEFAULT false NOT NULL,
	"status" text,
	"energy_labels" text,
	"occupants" integer,
	"purchase_date" date,
	"years_owned" double precision,
	"segment" text,
	"price_band" text,
	"price_low" bigint,
	"price_high" bigint,
	"transaction_type" text,
	"buyer_group" text,
	"owner_name" text,
	"transaction_address" text,
	"factsheet" text,
	"source_file" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "buyer_buildings_city_idx" ON "buyer_buildings" USING btree ("city");--> statement-breakpoint
CREATE TABLE "buyer_holdings" (
	"company_id" uuid NOT NULL,
	"bag_pand_id" text NOT NULL,
	"address" text,
	"city" text,
	"purchase_date" date,
	"years_owned" double precision,
	"segment" text,
	"source_file" text,
	CONSTRAINT "buyer_holdings_pk" PRIMARY KEY("company_id","bag_pand_id")
);
--> statement-breakpoint
ALTER TABLE "buyer_holdings" ADD CONSTRAINT "buyer_holdings_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."buyer_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_holdings_pand_idx" ON "buyer_holdings" USING btree ("bag_pand_id");--> statement-breakpoint
CREATE TABLE "buyer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"language" text DEFAULT 'nl' NOT NULL,
	"notes" text,
	"user_id" uuid,
	"unsubscribed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyer_contacts" ADD CONSTRAINT "buyer_contacts_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."buyer_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_contacts_company_idx" ON "buyer_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_contacts_email_idx" ON "buyer_contacts" USING btree ("company_id", lower("email"));--> statement-breakpoint
CREATE TABLE "buyer_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch" uuid,
	"status" text DEFAULT 'done' NOT NULL,
	"error" text,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'nl' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"preset" text DEFAULT 'institution' NOT NULL,
	"base_url" text NOT NULL,
	"created_by" uuid,
	"sender_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_listing_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "outreach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"token_hash" text NOT NULL,
	"score" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"user_id" uuid,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."buyer_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."buyer_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_messages_token_idx" ON "outreach_messages" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "outreach_messages_status_idx" ON "outreach_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outreach_messages_company_idx" ON "outreach_messages" USING btree ("company_id");
