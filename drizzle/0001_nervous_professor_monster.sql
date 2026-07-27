CREATE TABLE `analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`validation_id` integer NOT NULL,
	`response_count` integer NOT NULL,
	`signal_score` real NOT NULL,
	`confidence` real NOT NULL,
	`weighted_sentiment` real NOT NULL,
	`result_json` text NOT NULL,
	`model_version` text DEFAULT 'insight-v1.2' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`validation_id`) REFERENCES `validations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`member_tier` text DEFAULT 'free' NOT NULL,
	`reputation_score` real DEFAULT 500 NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
ALTER TABLE `responses` ADD `contributor_email` text;--> statement-breakpoint
ALTER TABLE `responses` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `responses` ADD `category` text;--> statement-breakpoint
ALTER TABLE `responses` ADD `model_weight` real;