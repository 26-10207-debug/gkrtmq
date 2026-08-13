CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	`source_note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`ai_model` text,
	`learning_json` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contributions_status_created_idx` ON `contributions` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `learning_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`mode` text NOT NULL,
	`completed_items` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_progress_unique_idx` ON `learning_progress` (`learner_id`,`asset_id`,`mode`);
--> statement-breakpoint
CREATE INDEX `learning_progress_learner_idx` ON `learning_progress` (`learner_id`,`updated_at`);
