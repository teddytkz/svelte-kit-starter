// src/lib/server/db/index.ts
//
// Build-safe, dev-safe Drizzle MySQL client.
//
// We use the *callback-style* `mysql2` package (not `mysql2/promise`) so
// `createConnection` is synchronous and the actual TCP/handshake is
// deferred. The constructor still fires the connect in the background, so
// on failure the `Connection` emits an `'error'` event. We must subscribe
// to it — otherwise Node rethrows via `process.nextTick(() => { throw err })`
// and the whole process dies (build, dev server, every endpoint).
//
// The first real query that runs after a failed handshake surfaces the
// error; `getCurrentUser` is called unguarded from `hooks.server.ts`, so
// SvelteKit's default `handleError` turns it into a clean 500 JSON
// envelope — no raw stack trace in the response.

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2';
import { env } from '$lib/env';
import * as schema from './schema';

type Schema = typeof schema;
export type Db = MySql2Database<Schema>;

const connection = createConnection({
	host: env.DB.URL,
	port: env.DB.PORT,
	user: env.DB.USER,
	password: env.DB.PASS,
	database: env.DB.NAME,
	multipleStatements: true
});

// Capture connect/handshake errors so they don't escape as unhandled.
connection.on('error', (err) => {
	// Log so sysadmins see handshake / drop failures; swallow so the
	// unhandled 'error' event doesn't kill the process. The next .query()
	// surfaces the error to the route's try/catch or to SvelteKit's
	// default handleError, which returns a clean 500 JSON.
	console.error('[db] connection error:', err);
});

export const db: Db = drizzle(connection, { schema, mode: 'default' });
