CREATE TABLE IF NOT EXISTS `auth_user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_verified` integer DEFAULT 0 NOT NULL,
  `image` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_user_email_unique` ON `auth_user` (`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_session` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL,
  `token` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `user_id` text NOT NULL REFERENCES `auth_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_session_token_unique` ON `auth_session` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_session_user_idx` ON `auth_session` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_account` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `auth_user`(`id`) ON DELETE CASCADE,
  `access_token` text,
  `refresh_token` text,
  `id_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `password` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_account_provider_unique_idx` ON `auth_account` (`provider_id`, `account_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_account_user_idx` ON `auth_account` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer,
  `updated_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_verification_identifier_idx` ON `auth_verification` (`identifier`);
