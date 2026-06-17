# Fix Plan: Subscribe to mysql2 `'error'` to prevent process crash

**Related PRD:** [login-jwt-auth.md](login-jwt-auth.md), supersedes [fix-lazy-db-connection.md](fix-lazy-db-connection.md)
**Severity:** Critical — `bun run build` fails and `bun run dev` crashes when MySQL is down.
**Date:** 2026-06-17

---

## Defect in the previous fix

Switching `src/lib/server/db/index.ts` from `mysql2/promise` to callback `mysql2` made `createConnection` *synchronous*, but did **not** stop the background TCP connect — the handshake fires from the `Connection` constructor. On failure the `Connection` emits `'error'`. Nothing subscribes, so `EventTarget` rethrows via `process.nextTick(() => { throw err })` and the process dies. `bun run build` is killed during the postbuild `analyse` phase (which walks the SSR module graph); `bun run dev` boots then dies on the next tick — every endpoint returns `status=000`. The previous plan's header claimed a `DatabaseUnavailableError` conversion on first query, but no code wired that up.

## Fix: subscribe to `'error'`. No Proxy.

Attach the listener and stop there. Drop the unused `DatabaseUnavailableError` class.

**Why:** a `Proxy` is a lot of code to keep an error type consistent, and `getCurrentUser` is called unguarded from `hooks.server.ts` — SvelteKit's default `handleError` already turns any thrown error into a clean 500 JSON envelope, which is exactly what we need. `login`/`register` are already inside their own `try/catch`. Converting the error type buys nothing observable, so the minimal fix wins.

### Final contents of `src/lib/server/db/index.ts`

````ts
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
connection.on('error', () => {
	// Swallow here; the error is raised by the next `.query()` and handled
	// by the route's try/catch or by SvelteKit's handleError.
});

export const db: Db = drizzle(connection, { schema, mode: 'default' });
````

## Files changed

One file: `src/lib/server/db/index.ts`. **Zero call-site changes** in `src/lib/server/auth.ts`, `src/routes/api/auth/login/+server.ts`, `src/routes/api/auth/register/+server.ts`, or `src/hooks.server.ts`.

## Acceptance criteria

- [ ] `bun run build` exits 0 with MySQL stopped.
- [ ] `bun run dev` starts and stays up with MySQL stopped.
- [ ] `curl /api/auth/me` returns HTTP 500 with a JSON error envelope (no raw stack trace).
- [ ] `curl /login` returns HTTP 200.
- [ ] `curl /dashboard` returns HTTP 303 with `Location: /login?next=%2Fdashboard`.
- [ ] No call site is modified.

## Rollback

`git checkout -- src/lib/server/db/index.ts` — single file, instant.
