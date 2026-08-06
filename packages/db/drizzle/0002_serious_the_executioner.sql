ALTER TABLE `projects` ADD `owner_id` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_owner_id` ON `projects` (`owner_id`);