# Fix Plan: Review findings — JWT auth

**Related PRD:** [login-jwt-auth.md](login-jwt-auth.md) **Reviewers:** Debugger + Security, 2026-06-17 **Severity:** High. **Date:** 2026-06-17

## Scope

8/8 items verified against both reviews. **One deviation:** `safeNext` lives in a new `src/lib/safe-next.ts` (client-safe), NOT in `auth.ts` as the task hinted — SvelteKit refuses to bundle `$lib/server/*` into `.svelte` files, and `auth.ts` also pulls in `bcryptjs`/`jose` which would bloat the client bundle. `safeNext` is pure logic, no server-only deps.

**Defer (out of this plan):** rate limiting, `tokenVersion` revocation, audit log, security headers, bcrypt 10→12, `iss`/`aud`, reserved names, `getCurrentUser` on every request. Lowercasing email on insert IS in scope (fix 3).

**Apply order** (no two fixes touch the same file; helpers before consumers): **4 → 5 → 7 → 2a → 1a → 2b → 3 → 6 → 1b**.

---

## Fix 1 — Open redirect via `?next=` (Debugger H1, Security H1)

**New file `src/lib/safe-next.ts`:**

````ts
// Client-safe `?next=` validator. SvelteKit blocks `$lib/server/*` from
// .svelte files; this has no server-only deps.

export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
	if (typeof next !== 'string') return fallback;
	if (!next.startsWith('/')) return fallback;
	// Reject protocol-relative (//evil.com) and backslash-prefixed paths
	// (browsers normalize \ to /, so /\evil.com is a same-origin escape).
	if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
	return next;
}
````

**`src/routes/login/+page.svelte`** — add the import and use it in `submit()` after `await invalidateAll();`:

````svelte
import { safeNext } from '$lib/safe-next';
// ...in submit() after `await invalidateAll();`:
const next = safeNext(page.url.searchParams.get('next'));
await goto(next, { invalidateAll: true });
````

---

## Fix 2 — Login timing oracle (Debugger H2, Security M1)

**`src/lib/server/auth.ts`** — header extension + new export:

````ts
// src/lib/server/auth.ts
// DUMMY_BCRYPT_HASH equalizes login response time when the username is
// not found, closing the timing-oracle username enumeration vector.
// ...existing imports (dev, redirect, RequestEvent, bcrypt, etc.)...

const SALT_ROUNDS = 10;
// ...existing COOKIE_NAME, COOKIE_MAX_AGE_S, USERNAME_RE...

// Precomputed at module load; the comparison result is discarded.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', SALT_ROUNDS);

export const DUMMY_BCRYPT_HASH = DUMMY_HASH;
````

**`src/routes/api/auth/login/+server.ts`** — import + new not-found branch:

````ts
// Add to import from '$lib/server/auth':
	DUMMY_BCRYPT_HASH,
// ...replace the `if (!user) return json({error:...401});` branch with:
		if (!user) {
			await verifyPassword(password, DUMMY_BCRYPT_HASH);
			return json({ error: 'Invalid username or password' }, { status: 401 });
		}
````

---

## Fix 3 — TOCTOU race → 409, email trim+lowercase (Debugger C2 + M2)

**`src/routes/api/auth/register/+server.ts`** — three edits:

````ts
// After `if (typeof email !== 'string') { return ... 400; }`, replace the
// direct `email` validation with:
		const normalizedEmail = email.trim().toLowerCase();
		if (!EMAIL_RE.test(normalizedEmail)) {
			return json({ error: 'Invalid email address' }, { status: 400 });
		}
		const normalizedUsername = username.trim().toLowerCase();
		// Use normalizedEmail + normalizedUsername in the .values({...}) call
		// and in the success response body.

// Replace the bare `} catch (err) { console.error(...); return 500; }` with:
		} catch (err) {
			console.error('register error:', err);
			// The unique key on users.username is authoritative. If a
			// concurrent request inserted the same username between our
			// existence check and our INSERT, the DB raises ER_DUP_ENTRY
			// (MySQL: errno 1062, sqlState 23000). Treat as 409.
			const e = err as { code?: string; errno?: number; sqlState?: string };
			if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062 || e?.sqlState === '23000') {
				return json({ error: 'Username already taken' }, { status: 409 });
			}
			return json({ error: 'Internal server error' }, { status: 500 });
		}
````

---

## Fix 4 — Migration idempotency (Debugger C1, Security M4)

**`db/migration/002_add_credentials.sql`** — add `IF NOT EXISTS` to the two `ADD COLUMN` lines and the `ADD UNIQUE KEY` line. New file:

````sql
-- 002_add_credentials.sql
-- Adds username + passwordHash to the users table for JWT auth.
-- Apply after 001_init.sql.
-- Idempotent on MySQL 8.0.29+ / MariaDB 10.0.2+ via IF NOT EXISTS.

ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `username` VARCHAR(64) NOT NULL,
    ADD COLUMN IF NOT EXISTS `password_hash` VARCHAR(255) NOT NULL,
    ADD UNIQUE KEY IF NOT EXISTS `users_username_unique` (`username`);
````

---

## Fix 5 — JWT secret minimum 16 → 32 (Debugger H3, Security M5)

`.env.example` placeholder is 36 chars and already passes the new floor — value unchanged, comment bumped.

**`src/lib/env.ts`** — replace the `v.length < 16` check:

````ts
// In env.ts, JWT.SECRET:
// HS256 requires ≥256 bits of secret (RFC 7518 §3.2). 32 ASCII chars
// is the minimum. Generate with: openssl rand -base64 32
if (v.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
````

**`.env.example`** (line 9, comment only — value stays):

````dotenv
# JWT signing secret. MUST be at least 32 random bytes in production.
# Generate with:  openssl rand -base64 32
# The server throws on startup if this is missing or shorter than 32 chars.
JWT_SECRET="change-me-in-production-min-32-chars"
````

---

## Fix 6 — Logout redirect chain (Debugger M1)

**`src/routes/dashboard/+page.server.ts`** — change the redirect target from `/login` to `/`:

````ts
// In the logout action:
		clearAuthCookie(event);
		// The user is no longer authenticated, so the old flow
		// (303 → /dashboard → load → 303 → /login?next=...) was two extra
		// redirects for no benefit. One redirect is enough.
		throw redirect(303, '/');
````

---

## Fix 7 — DB `'error'` listener should log (Debugger M4)

**`src/lib/server/db/index.ts`** — add the listener (place after the existing `connection = mysql.createConnection(...)` call):

````ts
// Log so sysadmins see handshake / drop failures (Debugger M4); swallow
// so the unhandled 'error' event doesn't kill the process. The next
// .query() surfaces the error to the route's try/catch or to
// SvelteKit's default handleError, which returns a clean 500 JSON.
connection.on('error', (err) => {
	console.error('[db] connection error:', err);
});
````

---

## Files changed

| File | Fix | Edit |
| --- | --- | --- |
| `db/migration/002_add_credentials.sql` | 4 | add `IF NOT EXISTS` to 3 clauses |
| `.env.example` | 5 | line 9 comment |
| `src/lib/env.ts` | 5 | `v.length < 16` → `v.length < 32` + error msg |
| `src/lib/server/db/index.ts` | 7 | add `connection.on('error', ...)` |
| `src/lib/server/auth.ts` | 2 | add `DUMMY_BCRYPT_HASH` constant + export |
| `src/lib/safe-next.ts` (new) | 1 | new file, 11 lines |
| `src/routes/api/auth/login/+server.ts` | 2 | import + new not-found branch |
| `src/routes/api/auth/register/+server.ts` | 3 | normalize email/username + ER_DUP_ENTRY catch |
| `src/routes/dashboard/+page.server.ts` | 6 | logout redirect → `/` |
| `src/routes/login/+page.svelte` | 1 | `import { safeNext }` + use in `submit()` |

No file touched by more than one fix. No new dependencies.

---

## Verification

```bash
bun run check   # svelte-check + tsc
bun run build   # load-bearing: if safeNext lived in $lib/server, the
                # build would fail because login/+page.svelte imports it
```

Manual: register two requests with the same username → second returns 409. Logout → response sets `Location: /` (not `/dashboard`). With MySQL stopped, `bun run dev` stays up and stderr shows `[db] connection error: …`.

---

## Acceptance criteria

- [ ] `bun run check` and `bun run build` both exit 0.
- [ ] Duplicate-username registration returns 409 with `{"error":"Username already taken"}`.
- [ ] Logout responds with `Location: /` (not `Location: /dashboard`).
- [ ] `bun run dev` starts and stays up with MySQL down; stderr shows `[db] connection error:` on failure.
- [ ] `JWT_SECRET` of < 32 chars causes a clear startup error mentioning "at least 32 characters".
- [ ] Re-running the migration is a DDL no-op (`IF NOT EXISTS` present on all 3 clauses).
- [ ] `safeNext('/dashboard') === '/dashboard'`, `safeNext('//evil.com') === '/dashboard'`, `safeNext('javascript:alert(1)') === '/dashboard'`, `safeNext(null) === '/dashboard'`.

---

## Rollback

```bash
git checkout -- db/migration/002_add_credentials.sql .env.example \
  src/lib/env.ts src/lib/server/db/index.ts src/lib/server/auth.ts \
  src/routes/api/auth/login/+server.ts src/routes/api/auth/register/+server.ts \
  src/routes/dashboard/+page.server.ts src/routes/login/+page.svelte
rm src/lib/safe-next.ts
```

No DB rollback needed (migration is a true DDL no-op on an already-migrated DB).
