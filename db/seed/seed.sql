-- seed.sql
-- Idempotent seed data. Safe to run multiple times.

INSERT INTO
	`users` (`name`, `email`)
VALUES
	('Alice', 'alice@example.com'),
	('Bob', 'bob@example.com'),
	('Charlie', 'charlie@example.com') ON DUPLICATE KEY UPDATE
	`name` = VALUES(`name`);
