import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * src/lib/server/db/schema/user.ts
 * Mirrors `db/migration/001_init.sql`.
 */

export const users = mysqlTable('users', {
	id: int('id').primaryKey().autoincrement(),
	name: varchar('name', { length: 255 }).notNull(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
