ALTER TABLE `contributions` ADD COLUMN `mechanical_options` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `mechanical_status` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `extracted_text` text;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `questions_json` text;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `recall_json` text;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `text_only` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `mechanical_error` text;
