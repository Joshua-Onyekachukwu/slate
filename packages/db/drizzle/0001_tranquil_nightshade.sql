CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`storyboard_id` text NOT NULL,
	`order` integer NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`prompt_pack` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`storyboard_id`) REFERENCES `storyboards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_storyboard_order_version` ON `scenes` (`storyboard_id`,`order`,`version`);--> statement-breakpoint
CREATE TABLE `storyboards` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storyboards_project_version` ON `storyboards` (`project_id`,`version`);