-- Outreach emails grant exactly what the admin chose: a set of properties (or all) and a set of features.
ALTER TABLE "outreach_campaigns" ADD COLUMN "listing_scope" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "listing_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "features" jsonb;
