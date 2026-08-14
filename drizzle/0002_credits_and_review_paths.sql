ALTER TABLE `contributions` ADD COLUMN `publish_mode` text DEFAULT 'instant' NOT NULL;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `credits_awarded` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `reviewed_at` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `credit_balance` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`contribution_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_contribution_unique_idx` ON `credit_ledger` (`contribution_id`) WHERE `contribution_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `credit_ledger_user_created_idx` ON `credit_ledger` (`user_id`,`created_at`);
