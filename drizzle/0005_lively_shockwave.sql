CREATE TABLE `study_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_files_object_key_unique` ON `study_files` (`object_key`);--> statement-breakpoint
ALTER TABLE `responses` ADD `contribution_type` text DEFAULT 'comment' NOT NULL;--> statement-breakpoint
ALTER TABLE `responses` ADD `answer_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `responses` ADD `base_reward` integer DEFAULT 35 NOT NULL;--> statement-breakpoint
ALTER TABLE `responses` ADD `reputation_after` real;--> statement-breakpoint
ALTER TABLE `validations` ADD `study_type` text DEFAULT 'idea' NOT NULL;--> statement-breakpoint
ALTER TABLE `validations` ADD `requested_data` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `validations` ADD `survey_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `validations` ADD `attachment_key` text DEFAULT '' NOT NULL;