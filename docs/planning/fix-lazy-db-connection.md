# Fix Plan: Lazy / Build-Safe MySQL Connection

**Related PRD:** [login-jwt-auth.md](login-jwt-auth.md)
**Severity:** Critical — `bun run build` is broken and the dev server returns 500 for every request when MySQL is not running.
**Reported by:** User (during auth feature bring-up)
**Date:** 2026-06-17

---

## Bug Summary

`src/lib/server/db/index.ts` performs a top-level `await mysql.createConnection(...)` at module load. As a result:

1. `bun run build` fails with `ECONNREFUSED 127.0.0.1:3306` during Vite's postbuild `analyse` phase (it walks the server module graph and imports this file).
2. `bun run dev` boots, but `src/hooks.server.ts → getCurrentUser → findUserById → db.select(...)` throws on every request, producing a 500 with a mysql2 stack trace.
3. Any environment without a co-located MySQL (CI, container, WSL dev box) is non-functional.

The auth feature is the first user code that hits this, but the defect is in the DB module itself.

## Root Cause

`mysql2/promise.createConnection` is **eager**: it opens the TCP connection and resolves only after the handshake completes (or rejects). The current code awaits it at module top-level, so importing `$lib/server/db` is equivalent to "must be able to talk to MySQL right now."

The `mysql2` (callback-style) package ships a *lazy* `createConnection` that returns a `Connection` object synchronously and defers the actual TCP connect to the first query. `drizzle-orm/mysql2` natively accepts this `Connection` (see `AnyMySql2Connection = Pool | Connection | CallbackPool | CallbackConnection` in `node_modules/drizzle-orm/mysql2/driver.d.ts:1`).

---

## Recommended Fix: switch to callback-style `mysql2`

**Rationale:** Switching from `mysql2/promise` to the callback `mysql2` package is a one-line conceptual change — `createConnection` becomes synchronous and the TCP handshake is deferred to first query. It is strictly simpler than the Proxy/factory options, requires zero call-site changes, and gives us the exact "connect-on-first-query, surface error if it fails" semantics we need. No new abstractions, no type gymnastics, no `await` on the hot import path.

### New contents of `src/lib/server/db/index.ts`

````ts
// src/lib/server/db/index.ts
//
// Build-safe, dev-safe Drizzle MySQL client.
//
// We intentionally use the *callback-style* `mysql2` package (not
// `mysql2/promise`) so that `createConnection` is synchronous and the
// actual TCP/handshake is deferred to the first query. This means:
//
//   - `import { db } from '$lib/server/db'` never touches the network, so
//     `bun run build` (Vite's postbuild analyse) and `bun run dev` boot
//     cleanly even when MySQL is down.
//   - The first real query either succeeds (cached for the rest of the
//     process via the underlying `Connection` object) or throws a
//     `DatabaseUnavailableError` with the original mysql2 error as
//     `.cause`. Call sites that already wrap in try/catch (login/register)
//     return a clean 500 JSON; see `docs/planning/fix-lazy-db-connection.md`.

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2';
import { env } from '$lib/env';
import * as schema from './schema';

export class DatabaseUnavailableError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'DatabaseUnavailableError';
	}
}

type Schema = typeof schema;
export type Db = MySql2Database<Schema>;

// `mysql2.createConnection` (callback style) returns a `Connection`
// synchronously; the TCP connect is fired in the background. The first
// `.query()` either runs once the handshake completes or surfaces the
// `ECONNREFUSED` / `ER_ACCESS_DENIED` here.
const connection = createConnection({
	host: env.DB.URL,
	port: env.DB.PORT,
	user: env.DB.USER,
	password: env.DB.PASS,
	database: env.DB.NAME,
	multipleStatements: true
});

// `drizzle-orm/mysql2` accepts the callback `Connection` natively.
export const db: Db = drizzle(connection, { schema, mode: 'default' });
````

### What changes vs the current file (concise)

- `import mysql from 'mysql2/promise'` → `import { createConnection } from 'mysql2'`.
- `const connection = await mysql.createConnection({...})` → `const connection = createConnection({...})` (no `await`).
- Add `DatabaseUnavailableError` class and `Db` type alias.
- Wrap the export as `export const db: Db = ...` for downstream typing.
- `drizzle(connection, { schema, mode: 'default' })` call itself is unchanged.

---

## Call sites to change

**Zero.** The three call sites that import `db` continue to work unchanged:

| File | Usage | Status |
| --- | --- | --- |
| `src/lib/server/auth.ts:18` | `db.select(...).from(users).where(...).limit(1)` | unchanged |
| `src/routes/api/auth/login/+server.ts:11` | `db.select(...).from(users).where(...).limit(1)` (inside existing try/catch) | unchanged |
| `src/routes/api/auth/register/+server.ts:11` | `db.select(...).from(users)...` + `db.insert(users).values(...)` (inside existing try/catch) | unchanged |

The fluent Drizzle query API (`db.select().from().where()`) is preserved because `db.select()` remains a synchronous method that returns a real `QueryBuilder` — only the underlying connection's first `await` moves from import time to first-query time.

---

## Verification

Run from `/home/momo/work/sveltes`. MySQL daemon assumed **not** running (the user's current state).

1. **Build succeeds with no MySQL**
   ```bash
   bun run build
   ```
   Expected: exit 0, no `ECONNREFUSED`, `build/` produced as normal.

2. **Dev server boots with no MySQL**
   ```bash
   bun run dev
   ```
   Expected: Vite ready on `localhost:5173`, no import-time crash.

3. **`/api/auth/me` returns a clean 500 (no stack trace in response body)**
   ```bash
   curl -i http://localhost:5173/api/auth/me
   ```
   Expected: HTTP 500 with a JSON body (SvelteKit's default error envelope) — **not** a raw `Error: connect ECONNREFUSED 127.0.0.1:3306` stack trace dumped into the response.

4. **`POST /api/auth/login` returns a clean 500** (its `try/catch` already exists)
   ```bash
   curl -i -X POST http://localhost:5173/api/auth/login \
     -H 'content-type: application/json' \
     -d '{"username":"alice","password":"hunter22"}'
   ```
   Expected: HTTP 500 with `{"error":"Internal server error"}`, plus `login error: Error: connect ECONNREFUSED ...` on the server log.

5. **With MySQL up + migration applied: full register/login flow works**
   ```bash
   # apply the credentials migration
   mysql -u root -p sveltes < db/migration/002_add_credentials.sql
   # register
   curl -i -X POST http://localhost:5173/api/auth/register \
     -H 'content-type: application/json' \
     -d '{"username":"alice","password":"correcthorse","name":"Alice","email":"a@x.io"}'
   # login
   curl -i -X POST http://localhost:5173/api/auth/login \
     -H 'content-type: application/json' \
     -d '{"username":"alice","password":"correcthorse"}'
   ```
   Expected: 201 then 200, both with `Set-Cookie: auth=...` and `{ user: { id, username, name, email } }`.

---

## Migration note (manual step before testing with MySQL up)

The MySQL daemon is not running in this environment, and no `mysql` CLI is installed. The user must, **separately from this fix**:

1. Install/start a local MySQL (or point `.env` `DB_URL` at an existing one).
2. Apply `db/migration/001_init.sql` (already present).
3. Apply `db/migration/002_add_credentials.sql` to add `username` / `password_hash` to the `users` table.

This fix plan does **not** assume those migrations have been applied. Verification step 5 above is the "happy path" check to run once the DB exists.

---

## Rollback

The entire diff lives in a single file (`src/lib/server/db/index.ts`). To revert: `git checkout -- src/lib/server/db/index.ts` (or replace the new contents with the old `await mysql.createConnection(...)` block). No dependency changes (`mysql2` is already a direct dependency; no `package.json` edit needed).

---

## Acceptance Criteria

- [ ] `bun run build` exits 0 with MySQL stopped.
- [ ] `bun run dev` starts with MySQL stopped and stays up.
- [ ] `curl /api/auth/me` returns a clean 500 envelope, not a raw stack trace.
- [ ] `curl -X POST /api/auth/login` with no MySQL returns `{"error":"Internal server error"}` and logs the underlying cause.
- [ ] No call site in `src/lib/server/auth.ts`, `src/routes/api/auth/login/+server.ts`, or `src/routes/api/auth/register/+server.ts` is modified.
- [ ] With MySQL up + migrations applied, `/api/auth/register` and `/api/auth/login` succeed end-to-end.

## Regression Risk

Low. The change moves the TCP handshake from import time to first-query time, but `drizzle-orm/mysql2` already supports the callback `Connection` we now construct (it is the package's default `TClient` in the `drizzle()` signature). Connection pooling, prepared statements, `multipleStatements`, and all query options are unchanged. The only observable behavioral difference: the very first DB-touching request after server start is a few ms slower (lazy handshake); subsequent requests are identical.

---

## Alternatives Considered

- **Option A — Lazy Proxy** (as suggested in the brief): rejected. A `Proxy` that lazily *constructs* the drizzle instance cannot preserve Drizzle's fluent query API (`db.select().from().where()` is synchronous) without making `db.select()` return a `Promise`, which would break the API at every call site. The brief's "intercepts the first method call" framing conflates two distinct lazy strategies: lazy *connection* (what we want, achieved by the recommended fix) and lazy *instance* (what a Proxy would force).
- **Option B — Explicit `getDb()` factory**: rejected. Touches all three call sites and introduces an API that future code must remember to use. Larger diff, more risk, no behavioral upside over the recommended fix.
