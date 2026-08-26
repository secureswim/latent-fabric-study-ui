CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`sequence` text NOT NULL,
	`researcher_initials` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_trial` integer DEFAULT 0 NOT NULL,
	`state_json` text NOT NULL,
	`started_at` integer NOT NULL,
	`elapsed_ms` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_study_sessions_status_updated` ON `study_sessions` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_study_sessions_participant` ON `study_sessions` (`participant_id`);--> statement-breakpoint
CREATE TABLE `study_trials` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`trial_number` integer NOT NULL,
	`referent_id` text NOT NULL,
	`referent_label` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft_json` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_study_trials_session_trial` ON `study_trials` (`session_id`,`trial_number`);--> statement-breakpoint
CREATE INDEX `idx_study_trials_session` ON `study_trials` (`session_id`);