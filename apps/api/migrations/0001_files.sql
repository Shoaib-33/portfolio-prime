CREATE TABLE "files" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
