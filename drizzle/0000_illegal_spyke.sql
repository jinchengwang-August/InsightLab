CREATE TABLE `responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`validation_id` integer NOT NULL,
	`body` text NOT NULL,
	`sentiment` real,
	`specificity` real,
	`constructiveness` real,
	`integrity_score` real,
	`reward_granted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`validation_id`) REFERENCES `validations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `validations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`stage` text DEFAULT 'problem-discovery' NOT NULL,
	`target_responses` integer DEFAULT 100 NOT NULL,
	`reward_points` integer DEFAULT 50 NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`signal_score` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL
);
