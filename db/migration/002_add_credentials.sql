-- 002_add_credentials.sql
-- Adds username + passwordHash to the users table for JWT auth.
-- Apply after 001_init.sql.
-- Idempotent on MySQL 8.0.29+ / MariaDB 10.0.2+ via IF NOT EXISTS.

ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `username` VARCHAR(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `password_hash` VARCHAR(255) NOT NULL,
    ADD UNIQUE KEY IF NOT EXISTS `users_username_unique` (`username`);
