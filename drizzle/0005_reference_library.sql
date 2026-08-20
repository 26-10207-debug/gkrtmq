CREATE TABLE IF NOT EXISTS `reference_library` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `topic` text NOT NULL,
  `source_name` text NOT NULL,
  `source_url` text NOT NULL,
  `license_note` text NOT NULL,
  `access_mode` text NOT NULL,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reference_library_topic_idx` ON `reference_library` (`topic`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reference_library_source_idx` ON `reference_library` (`source_name`);
