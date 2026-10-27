-- Three demo accounts: developer, admin and one investor. Runs once: pro@demo.nl becomes investor@demo.nl (keeping its
-- verification, subscription and history); every other investor account is deactivated (not erased). Investors the admin
-- invites afterwards are never touched by this.
UPDATE "users" SET "email" = 'investor@demo.nl', "name" = 'Iris Investor', "account_manager" = 'Ada Admin', "access_updated_at" = NULL
  WHERE "email" = 'pro@demo.nl' AND NOT EXISTS (SELECT 1 FROM "users" WHERE "email" = 'investor@demo.nl');
--> statement-breakpoint
UPDATE "users" SET "deleted_at" = now(), "status" = 'suspended'
  WHERE "role" = 'investor' AND "email" <> 'investor@demo.nl' AND "deleted_at" IS NULL;
--> statement-breakpoint
DELETE FROM "sessions" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "deleted_at" IS NOT NULL);
--> statement-breakpoint
UPDATE "invites" SET "revoked_at" = now() WHERE "used_at" IS NULL AND "revoked_at" IS NULL AND "user_id" IN (SELECT "id" FROM "users" WHERE "deleted_at" IS NOT NULL);
