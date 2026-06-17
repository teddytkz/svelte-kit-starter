-- seed.sql
-- Idempotent seed data. Safe to run multiple times.
-- Username: admin | Password: password

INSERT INTO
	`users` (`name`, `email`, `username`, `password_hash`)
VALUES
	('Admin', 'admin@example.com', 'admin', '$2b$10$mlyDaWt2XT.RhiX1TTo9X.Ax8uqDZ4krXLE3XzLiAEN1omYNJF5EG') ON DUPLICATE KEY UPDATE
	`name` = VALUES(`name`),
	`username` = VALUES(`username`),
	`password_hash` = VALUES(`password_hash`);
