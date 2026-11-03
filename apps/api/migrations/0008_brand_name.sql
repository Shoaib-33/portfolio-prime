UPDATE "sale_processes" SET "advisor" = replace("advisor", 'Portfolio & Prime', 'Maasland & Partners') WHERE strpos("advisor", 'Portfolio & Prime') > 0;--> statement-breakpoint
UPDATE "users" SET "account_manager" = replace("account_manager", 'Portfolio & Prime', 'Maasland & Partners') WHERE strpos("account_manager", 'Portfolio & Prime') > 0;
