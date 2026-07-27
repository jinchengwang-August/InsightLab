CREATE TABLE `presence` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`current_view` text DEFAULT 'home' NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL
);
