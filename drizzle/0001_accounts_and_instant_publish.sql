ALTER TABLE `contributions` ADD COLUMN `owner_id` text;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `owner_email` text;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `owner_display_name` text;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `view_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `contributions_owner_created_idx` ON `contributions` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
