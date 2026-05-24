CREATE TABLE `email_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_email_tokens_user_kind` ON `email_tokens` (`user_id`,`kind`);--> statement-breakpoint
DROP INDEX `domains_domain_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` text;--> statement-breakpoint
CREATE INDEX `idx_idempotency_user_key` ON `idempotency_keys` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `idx_idempotency_created` ON `idempotency_keys` (`created_at`);