import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * src/lib/server/db/schema/user.ts
 * Mirrors `db/migration/001_init.sql` and `db/migration/002_add_credentials.sql`.
 */

export const users = mysqlTable('users', {
	id: int('id').primaryKey().autoincrement(),
	name: varchar('name', { length: 255 }).notNull(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	username: varchar('username', { length: 64 }).notNull().unique(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/** Public-safe user shape (no passwordHash). Returned from /api/auth/* endpoints. */
export type PublicUser = Pick<User, 'id' | 'username' | 'name' | 'email'>;
