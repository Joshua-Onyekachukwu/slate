CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"idea" text NOT NULL,
	"title" text,
	"stage" text DEFAULT 'discovery' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"conversation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brief" jsonb,
	"brief_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research_packet" jsonb,
	"research_status" text DEFAULT 'pending' NOT NULL,
	"characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storyboard_version" integer DEFAULT 0 NOT NULL,
	"production_plan_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storyboard_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"prompt_pack" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"review_scores" jsonb,
	"review_notes" text,
	"created_by" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storyboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_storyboard_id_storyboards_id_fk" FOREIGN KEY ("storyboard_id") REFERENCES "public"."storyboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboards" ADD CONSTRAINT "storyboards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_id" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_storyboard_order_version" ON "scenes" USING btree ("storyboard_id","order","version");--> statement-breakpoint
CREATE UNIQUE INDEX "scripts_project_version" ON "scripts" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "storyboards_project_version" ON "storyboards" USING btree ("project_id","version");