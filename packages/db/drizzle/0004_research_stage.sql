ALTER TABLE `projects` ADD `research_packet` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `research_status` text DEFAULT 'pending' NOT NULL;
