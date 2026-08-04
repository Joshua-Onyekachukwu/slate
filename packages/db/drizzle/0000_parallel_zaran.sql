CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`idea` text NOT NULL,
	`title` text,
	`stage` text DEFAULT 'discovery' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`conversation` text DEFAULT '[]' NOT NULL,
	`brief` text,
	`brief_history` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`review_scores` text,
	`review_notes` text,
	`created_by` text DEFAULT 'ai' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scripts_project_version` ON `scripts` (`project_id`,`version`);