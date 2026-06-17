# Plan: JWT Login (username + password) with shadcn-svelte login-02

**Feature:** Username + password authentication using a JWT stored in an httpOnly cookie. UI is built from the shadcn-svelte `login-02` block.
**Status:** Draft
**Author:** Planner Agent
**Created:** 2026-06-17
**Related docs:** [PRD-sveltekit-bun-setup.md](PRD-sveltekit-bun-setup.md), [docs/deployment/adapter-node.md](../deployment/adapter-node.md)

---

## Overview

Add credential-based authentication to the SvelteKit app: users register with a username + password, sign in, and receive a JWT in an httpOnly cookie that `hooks.server.ts` validates on every request to populate `event.locals.user`. The login UI is generated from the shadcn-svelte `login-02` block (`bunx shadcn-svelte@latest add login-02`).

**Why this design:** the user explicitly asked for "JWT only" with username + password, and the codebase has no existing auth layer. The minimal, dependency-light path is: add two columns to the existing `users` table, install `jose` + `bcryptjs`, write three API routes + one server hook, wire a single login page, and prove the flow with a protected `/dashboard` route.

---

## Codebase Context (from Codebase Explorer)

- **Stack:** SvelteKit 2.63 + Svelte 5 (runes), TypeScript strict, Tailwind v4, Bun, Drizzle ORM + MySQL (`mysql2`), TanStack Svelte Query 6.x, `@sveltejs/adapter-node` 5.5.
- **shadcn-svelte 1.3** is already configured (`components.json`, `style: "vega"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`, aliases wired: `components → $lib/components`, `ui → $lib/components/ui`).
- **Only one shadcn component is installed:** `src/lib/components/ui/button/`. The login-02 block will pull in additional components (Card, Input, Label, Checkbox are typical).
- **Existing user table** (`src/lib/server/db/schema/user.ts`): `id`, `name`, `email` (unique), `createdAt`, `updatedAt`. No `username`, no password column.
- **DB client** (`src/lib/server/db/index.ts`): single `mysql.createConnection` wrapped by Drizzle, with `multipleStatements: true` (handy for raw SQL).
- **Env** (`src/lib/env.ts`): typed `env.DB.{URL,PORT,USER,PASS,NAME}` with a `required()` helper. Pattern: extend this same object with a new `env.JWT.SECRET` group.
- **`.env.example`:** contains only DB vars. No `JWT_SECRET` yet.
- **No `hooks.server.ts` exists** — SvelteKit's request pipeline is currently default (no `event.locals` population).
- **`app.d.ts` is empty** — no `App.Locals`, no `App.PageData` augmentation.
- **No `drizzle.config.ts`** and no migration runner script. Schema is mirrored to `db/migration/001_init.sql` (hand-maintained). Migrations are applied by running the SQL against the DB manually. **This is the project's existing convention; we follow it, not introduce drizzle-kit.**
- **Routes** currently: `+layout.{svelte,ts}`, `+page.{svelte,ts}` (a posts demo). No `/login`, no `/dashboard`.
- **Build target:** `bun ./build/index.js` (adapter-node, `out: 'build'`).
- **Package manager:** Bun. `bun add` for runtime deps, `bun add -d` for dev.

---

## 1. Schema Changes

### Decision: extend the existing `users` table, do NOT create a separate credentials table

The current `users` table is the only user concept in the schema. A separate `user_credentials` table would create a needless 1-to-1 join for the lifetime of the app, and credential rotation is not in scope. Adding two columns is the lowest-friction path and matches the existing "one user row per account" model.

### Columns to add

| Column        | Type                                            | Null? | Default | Notes                                              |
| ------------- | ----------------------------------------------- | ----- | ------- | -------------------------------------------------- |
| `username`    | `VARCHAR(64)`                                   | NO    | —       | `UNIQUE`, ASCII-only validation enforced at app layer. Trim + lowercase before save. |
| `passwordHash`| `VARCHAR(255)`                                  | NO    | —       | bcrypt hash; ~60 chars typical, 255 covers future hash formats. |

`email` stays as-is (still unique, still required for the existing demo data shape). `name` stays. We are not dropping or renaming any existing column — non-breaking for any other code that reads `users`.

### How to apply (lowest-friction dev path — no drizzle-kit)

The project does not use drizzle-kit. It hand-maintains `db/migration/001_init.sql` to mirror the Drizzle schema. Follow the same convention:

1. Add a new file `db/migration/002_add_credentials.sql` containing the `ALTER TABLE` statements.
2. Update the Drizzle schema file `src/lib/server/db/schema/user.ts` to declare the two new columns. Update the `// Mirrors db/migration/001_init.sql` comment to reference both files.
3. Manually apply the SQL to the dev DB. Recommended: `mysql -u root -p sveltes < db/migration/002_add_credentials.sql` (or run it through your GUI of choice).

### `db/migration/002_add_credentials.sql`

```sql
-- 002_add_credentials.sql
-- Adds username + passwordHash to the users table for JWT auth (PRD: login-jwt-auth).
-- Apply after 001_init.sql. Idempotent via IF NOT EXISTS.

ALTER TABLE `users`
    ADD COLUMN `username` VARCHAR(64) NOT NULL,
    ADD COLUMN `password_hash` VARCHAR(255) NOT NULL,
    ADD UNIQUE KEY `users_username_unique` (`username`);
```

> **Note on existing rows:** this `ALTER` will fail on the existing dev rows (the two new columns are `NOT NULL` and there is no default). If the dev DB has rows you care about, give them a username + a temporary bcrypt hash (`$2a$10$...`) first, or `TRUNCATE users;` for a clean dev reset. The implementation agent will ask the user which to do.

### Updated `src/lib/server/db/schema/user.ts`

```ts
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
```

---

## 2. Dependencies

### Install (runtime)

```bash
bun add jose bcryptjs
bun add -D @types/bcryptjs
```

| Package        | Why                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------- |
| `jose`         | JWT sign + verify. Modern, edge-runtime compatible, Web Crypto API based, no callback hell. Works in Bun/Node. **Preferred over `jsonwebtoken`** (which is callback-based, not Edge-runtime safe, and has had CVEs around algorithm confusion). |
| `bcryptjs`     | Pure-JS bcrypt. No native compilation, no Python/CC deps, no `node-gyp`. Tradeoff: ~3x slower than native `bcrypt`/`@node-rs/bcrypt`, but login/register is not hot-path. For a dev/hobby deployment this is the lowest-friction choice. **If the user later wants to switch to `@node-rs/bcrypt` for prod**, the call sites (`hashPassword`/`verifyPassword` in `src/lib/server/auth.ts`) are the only places that need to change. |
| `@types/bcryptjs` | TypeScript types for `bcryptjs` (not bundled).                                      |

### Do NOT install

- No `lucia`, no `auth.js`, no `@auth/sveltekit` — explicit constraint: JWT only.
- No `cookie` lib — SvelteKit's `event.cookies` is sufficient.
- No `zod` / `valibot` for this feature — validation is 5 lines of inline checks. Add a schema lib later if it grows.
- No `sonner` / `mode-watcher` — login errors render as an inline `<p role="alert">` under the form. (We can add toasts in a follow-up if the app grows.)

---

## 3. Backend API Endpoints

All four endpoints live under `src/routes/api/auth/<name>/+server.ts`. Each is a named export `POST` (or `GET` for `/me`). Each sets / reads the auth cookie via the helpers in `src/lib/server/auth.ts` (see §4).

### 3.1 `POST /api/auth/register`

**Request body** (JSON):

```json
{
	"username": "alice",
	"password": "correct horse battery staple",
	"name": "Alice Example",
	"email": "alice@example.com"
}
```

**Validation** (return `400` on failure with `{ "error": "<message>" }`):

- `username`: trimmed, 3–32 chars, matches `/^[a-z0-9_-]+$/i` (case-insensitive, stored lowercased).
- `password`: ≥ 8 chars.
- `email`: simple regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `name`: 1–255 chars.

**Server logic:**

1. Validate body.
2. `SELECT` user where `username = lowercasedUsername`. If found → `409 { "error": "Username already taken" }`.
3. `passwordHash = await hashPassword(password)`.
4. `INSERT INTO users (name, email, username, password_hash) VALUES (?, ?, ?, ?)`. Capture `insertId`.
5. `signJwt({ sub: insertId, username: lowercasedUsername })`.
6. `event.cookies.set('auth', token, cookieOptions())`.
7. Return `201 { "user": { "id": insertId, "username": "alice", "name": "Alice Example", "email": "alice@example.com" } }`.

**Status codes:**

- `201 Created` — success.
- `400 Bad Request` — validation error.
- `409 Conflict` — username already exists.
- `500 Internal Server Error` — DB / unexpected.

### 3.2 `POST /api/auth/login`

**Request body:**

```json
{ "username": "alice", "password": "correct horse battery staple" }
```

**Server logic:**

1. Validate body (same rules as register for shape only — do not leak which field is wrong).
2. `SELECT * FROM users WHERE username = ? LIMIT 1`.
3. If no row OR `verifyPassword(password, user.passwordHash)` is false → `401 { "error": "Invalid username or password" }` (generic — do not leak which side failed).
4. `signJwt({ sub: user.id, username: user.username })`.
5. `event.cookies.set('auth', token, cookieOptions())`.
6. Return `200 { "user": { "id": ..., "username": "alice", "name": "Alice Example", "email": "alice@example.com" } }`.

**Status codes:**

- `200 OK` — success.
- `400 Bad Request` — malformed body.
- `401 Unauthorized` — bad credentials (generic message).
- `500` — DB / unexpected.

### 3.3 `POST /api/auth/logout`

**Server logic:**

1. `event.cookies.delete('auth', { path: '/' })`.
2. Return `200 { "ok": true }`.

No body required. No 401 path (logout is idempotent — deleting an already-absent cookie is fine).

### 3.4 `GET /api/auth/me`

**Server logic:**

1. `event.locals.user` is already populated by `hooks.server.ts` (see §5).
2. If `null` → `401 { "user": null }`.
3. Else → `200 { "user": { "id", "username", "name", "email" } }` (re-query DB so a deleted user is reflected as 401; OR trust the JWT — pick re-query for safety. Re-query is one indexed lookup, cheap.)

**Status codes:**

- `200 OK` — authenticated.
- `401 Unauthorized` — no valid token.

### 3.5 Cookie configuration (centralized helper)

```ts
// src/lib/server/auth.ts
const COOKIE_NAME = 'auth';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

export function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: !dev, // false in dev (http://localhost), true in prod
		maxAge: COOKIE_MAX_AGE_S
	};
}
```

> **Why httpOnly + SameSite=Lax, not localStorage:** an httpOnly cookie is unreadable to JavaScript, so an XSS bug in our app cannot exfiltrate the token. `SameSite=Lax` blocks cross-origin POST CSRF while still allowing top-level navigation (the user can follow a link to `/dashboard`). `Secure` is enabled in production so the cookie is only sent over HTTPS. localStorage would be vulnerable to any XSS and is rejected.

---

## 4. Server-side Auth Utilities — `src/lib/server/auth.ts`

One file, server-only. Marked by being under `src/lib/server/` (SvelteKit will refuse to bundle it into the client).

### Exports

```ts
// src/lib/server/auth.ts
import { dev } from '$app/environment';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { env } from '$lib/env';
import { db } from '$lib/server/db';
import { users, type PublicUser } from '$lib/server/db/schema/user';

const SALT_ROUNDS = 10;
const COOKIE_NAME = 'auth';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7; // 7d
const USERNAME_RE = /^[a-z0-9_-]{3,32}$/i;

export const COOKIE = COOKIE_NAME;
export const COOKIE_MAX_AGE = COOKIE_MAX_AGE_S;

// Read the secret once at module load. Throws on startup if missing — fail fast.
const SECRET = new TextEncoder().encode(env.JWT.SECRET); // requires env.JWT.SECRET

export interface JwtClaims {
	sub: string;      // user id, stringified
	username: string;
	exp?: number;     // set by jose
}

export function cookieOptions() { /* see §3.5 */ }

export async function hashPassword(plain: string): Promise<string> {
	return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
	return bcrypt.compare(plain, hash); // constant-time
}

export async function signJwt(claims: { sub: number; username: string }): Promise<string> {
	return new SignJWT({ username: claims.username })
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setSubject(String(claims.sub))
		.setIssuedAt()
		.setExpirationTime(`${COOKIE_MAX_AGE_S}s`)
		.sign(SECRET);
}

export async function verifyJwt(token: string): Promise<JwtClaims | null> {
	try {
		const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
		if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') return null;
		return payload as JwtClaims;
	} catch {
		return null; // expired, bad signature, malformed
	}
}

export function setAuthCookie(event: RequestEvent, token: string): void {
	event.cookies.set(COOKIE_NAME, token, cookieOptions());
}

export function clearAuthCookie(event: RequestEvent): void {
	event.cookies.delete(COOKIE_NAME, { path: '/' });
}

export function readAuthCookie(event: RequestEvent): string | undefined {
	return event.cookies.get(COOKIE_NAME);
}

/** Look up the user row by id; returns PublicUser (no hash) or null. */
export async function findUserById(id: number): Promise<PublicUser | null> {
	const rows = await db.select({ id: users.id, username: users.username, name: users.name, email: users.email })
		.from(users).where(eq(users.id, id)).limit(1);
	return rows[0] ?? null;
}

/** Populate locals.user from the cookie. Cheap on hot path: ~1 verify + 1 indexed SELECT. */
export async function getCurrentUser(event: RequestEvent): Promise<PublicUser | null> {
	const token = readAuthCookie(event);
	if (!token) return null;
	const claims = await verifyJwt(token);
	if (!claims) return null;
	const id = Number(claims.sub);
	if (!Number.isInteger(id) || id <= 0) return null;
	return findUserById(id);
}

/** Throws redirect to /login (303) if not authenticated. Use in +page.server.ts load(). */
export function requireAuth(event: RequestEvent): PublicUser {
	if (!event.locals.user) {
		const next = encodeURIComponent(event.url.pathname + event.url.search);
		throw redirect(303, `/login?next=${next}`);
	}
	return event.locals.user;
}

export function isValidUsername(s: string): boolean {
	return USERNAME_RE.test(s);
}
```

### Env — extend `src/lib/env.ts`

Add a `JWT` group next to `DB`. Follow the existing `required()` pattern. **Throws on import** if `JWT_SECRET` is missing — fails fast, matches the existing `DB.*` behavior.

```ts
// src/lib/env.ts (additions)
export const env = {
	DB: { /* unchanged */ },
	JWT: {
		SECRET: required('JWT_SECRET')
	}
} as const;
```

---

## 5. `src/hooks.server.ts`

Single file, exports `handle`. No path-based global enforcement — protected routes opt in via `requireAuth` in their `+page.server.ts`.

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await getCurrentUser(event);
	return resolve(event);
};
```

Why this is sufficient and not "global": global auth would force even `/login` to be a server-rendered page that can't be cached, and would block asset prefetch. The opt-in model matches SvelteKit's docs and keeps the `/login` page anonymously accessible. The `/dashboard` route calls `requireAuth` in its `+page.server.ts` load (see §7.4).

---

## 6. `src/app.d.ts` Updates

Augment `App.Locals` so `event.locals.user` is typed everywhere. `App.PageData` is augmented so `+layout.server.ts` (if added later) and `+page.server.ts` can hand `user` to the client.

```ts
// src/app.d.ts
import type { PublicUser } from '$lib/server/db/schema/user';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: PublicUser | null;
		}
		interface PageData {
			user: PublicUser | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
```

We also need `+layout.server.ts` to expose `locals.user` as `data.user` so client components can read it. See §7.1.

---

## 7. Frontend / UI Integration

### 7.1 `src/routes/+layout.server.ts` (new)

Exposes `event.locals.user` to the client as `data.user`. Now every page can read `data.user.username` from `$props()` without re-fetching.

```ts
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user };
};
```

### 7.2 Install the shadcn-svelte login-02 block

Run from the project root:

```bash
bunx shadcn-svelte@latest add login-02
```

The CLI will:

- Detect the existing `components.json` (style `vega`, `baseColor: neutral`, `lucide` icons).
- Add the missing base components this block depends on (typically `card`, `input`, `label`, `checkbox` — and any transitive deps). Each lands under `$lib/components/ui/<name>/` with an `index.ts` barrel.
- Drop the block source at `src/routes/(auth)/login-02/login-02.svelte` (path may vary slightly by registry version — the agent should follow whatever the CLI prints). The block is a styled, animated login card with username/email + password inputs and a "Login" button.

**What the implementation agent should do with the installed file:**

- It is a self-contained demo component, not a route. The agent should:
  1. Read the installed file to learn which components it uses (so the form submission handler is wired correctly).
  2. Move / adapt the markup into `src/routes/login/+page.svelte` so it lives under our `/login` route. The `(auth)` route group from the block can be deleted.
  3. Replace whatever email/username field the block has with a single `username` field + `password` field matching the API contract.
  4. Wire the submit handler to POST to `/api/auth/login` (see §7.3).

### 7.3 `src/routes/login/+page.svelte`

Self-contained Svelte 5 component. Uses the Card/Input/Label/Button components added by the shadcn install. Inline error banner — no toast lib needed for this single page.

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	type Mode = 'login' | 'register';

	let mode = $state<Mode>('login');
	let username = $state('');
	let password = $state('');
	let name = $state('');
	let email = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		submitting = true;
		try {
			const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
			const body =
				mode === 'login'
					? { username, password }
					: { username, password, name, email };

			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				error = data.error ?? 'Something went wrong. Please try again.';
				return;
			}

			await invalidateAll(); // re-run +layout.server.ts so data.user updates
			const next = page.url.searchParams.get('next') ?? '/dashboard';
			await goto(next, { invalidateAll: true });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error';
		} finally {
			submitting = false;
		}
	}
</script>

<!-- Markup adapted from shadcn-svelte login-02 block.
     Single-column card on muted background. Username + password only.
     Register mode shows name + email fields. -->
<main class="flex min-h-svh items-center justify-center bg-muted p-6">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title class="text-2xl">
				{mode === 'login' ? 'Log in' : 'Create an account'}
			</Card.Title>
			<Card.Description>
				{mode === 'login'
					? 'Enter your username and password to continue.'
					: 'Pick a username and password to get started.'}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={submit} class="grid gap-4">
				<div class="grid gap-2">
					<Label for="username">Username</Label>
					<Input id="username" name="username" autocomplete="username" required bind:value={username} />
				</div>
				<div class="grid gap-2">
					<Label for="password">Password</Label>
					<Input id="password" name="password" type="password" autocomplete="current-password" required minlength={8} bind:value={password} />
				</div>
				{#if mode === 'register'}
					<div class="grid gap-2">
						<Label for="name">Name</Label>
						<Input id="name" name="name" autocomplete="name" required bind:value={name} />
					</div>
					<div class="grid gap-2">
						<Label for="email">Email</Label>
						<Input id="email" name="email" type="email" autocomplete="email" required bind:value={email} />
					</div>
				{/if}
				{#if error}
					<p role="alert" class="text-sm text-destructive">{error}</p>
				{/if}
				<Button type="submit" disabled={submitting} class="w-full">
					{submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
				</Button>
				<button
					type="button"
					class="text-muted-foreground text-sm underline-offset-4 hover:underline"
					onclick={() => { mode = mode === 'login' ? 'register' : 'login'; error = null; }}
				>
					{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
				</button>
			</form>
		</Card.Content>
	</Card.Root>
</main>
```

> If the shadcn-svelte version of the login-02 block has its own specific prop names (it ships as a complete block), the agent should keep the visual structure intact and just rewrite the field set + handler to match the above. The block is the design system layer; the form is the contract layer.

### 7.4 `src/routes/dashboard/+page.server.ts` (new — protected route proof)

Demonstrates the auth flow end-to-end. Calls `requireAuth`, returns the user, renders a logout button.

```ts
// src/routes/dashboard/+page.server.ts
import { requireAuth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const user = requireAuth(event); // throws redirect(303, '/login?next=...') if not authed
	return { user };
};

export const actions: Actions = {
	logout: async (event) => {
		const { clearAuthCookie } = await import('$lib/server/auth');
		clearAuthCookie(event);
		// Redirect target: the route itself so SvelteKit's form action pattern works
		// without an API roundtrip. Cookie is gone, so load() will 303 to /login.
		throw redirect(303, '/dashboard');
	}
};
```

> The `import('...')` inside the action is to avoid a static circular — auth.ts is fine to import statically; this example shows the alternative. Static import is preferred.

### 7.5 `src/routes/dashboard/+page.svelte` (new)

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="mx-auto max-w-2xl space-y-6 p-6">
	<header class="flex items-center justify-between">
		<h1 class="text-3xl font-semibold">Dashboard</h1>
		<form method="POST" action="?/logout">
			<Button type="submit" variant="outline">Log out</Button>
		</form>
	</header>
	<section class="rounded-lg border p-4">
		<h2 class="font-medium">Signed in as</h2>
		<dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
			<dt class="text-muted-foreground">ID</dt><dd>{data.user.id}</dd>
			<dt class="text-muted-foreground">Username</dt><dd>{data.user.username}</dd>
			<dt class="text-muted-foreground">Name</dt><dd>{data.user.name}</dd>
			<dt class="text-muted-foreground">Email</dt><dd>{data.user.email}</dd>
		</dl>
	</section>
</main>
```

### 7.6 Update `src/routes/+page.svelte` (the home page)

Make the existing demo aware of auth state — when not logged in, link to `/login`; when logged in, link to `/dashboard`. This is a one-line tweak to the header.

```diff
 <header class="flex items-center justify-between">
 	<h1 class="text-3xl font-semibold">Latest Posts</h1>
+	<nav class="flex items-center gap-3 text-sm">
+		{#if data.user}
+			<a href="/dashboard" class="underline-offset-4 hover:underline">
+				{data.user.username}
+			</a>
+		{:else}
+			<a href="/login" class="underline-offset-4 hover:underline">Log in</a>
+		{/if}
+	</nav>
 	<Button …>
```

`data` in `+page.svelte` currently comes from `PageData`; with the new `+layout.server.ts`, `data.user` is automatically inherited. `+page.ts` continues to handle the posts prefetch — the new `+layout.server.ts` runs first and does not interfere with `+page.ts`.

---

## 8. Environment Variables

### `.env.example` — add

```diff
 DB_NAME="sveltes"
+
+# JWT signing secret. MUST be at least 32 random bytes in production.
+# Generate with:  openssl rand -base64 32
+# The server will throw on startup if this is missing or shorter than 16 chars.
+JWT_SECRET="change-me-in-production-min-32-chars"
```

### Strengthen the env check in `src/lib/env.ts`

Optional but cheap: enforce minimum length so a misconfigured deploy fails loudly rather than signing tokens with `"dev"`.

```ts
// in env.ts, JWT.SECRET:
SECRET: (() => {
	const v = required('JWT_SECRET');
	if (v.length < 16) throw new Error('JWT_SECRET must be at least 16 characters');
	return v;
})()
```

Document the `openssl rand -base64 32` line in the README's "Environment" section as a follow-up (not blocking this plan).

---

## 9. Security Checklist

| Concern | Status | How it's addressed |
| --- | --- | --- |
| Passwords stored as plain text | ✅ Mitigated | `bcryptjs.hash(password, 10)` before insert. Column name `passwordHash` makes the intent obvious. |
| Password compared with `===` (timing leak) | ✅ Mitigated | `bcrypt.compare` is constant-time by design. |
| Generic error on bad credentials | ✅ Mitigated | Login returns `401 { "error": "Invalid username or password" }` regardless of whether the user exists. Username-uniqueness on register returns a distinct `409` (acceptable — register is not a credential-attack vector since you must also know the password). |
| Token readable to JavaScript (XSS) | ✅ Mitigated | httpOnly cookie. |
| CSRF | ✅ Mitigated | `SameSite=Lax`. SvelteKit form actions have built-in same-origin POST protection; our `POST /api/auth/*` endpoints are JSON-only (require `content-type: application/json`), which blocks naive cross-origin form posts. |
| JWT tampering | ✅ Mitigated | HS256 with `JWT_SECRET`. `jwtVerify` checks signature + `exp`. Algorithm pinned to `['HS256']` to prevent `alg: none` confusion. |
| Stale JWT after user deletion | ✅ Mitigated | `getCurrentUser` re-queries the DB on every request. A deleted user's valid JWT returns 401 on the next request. |
| Weak JWT secret in production | ✅ Mitigated | `env.JWT.SECRET` throws if missing or < 16 chars. Document `openssl rand -base64 32` in README. |
| Cookie not Secure in prod | ✅ Mitigated | `cookieOptions()` uses `secure: !dev` — true in prod, false in dev. |
| Rate limiting on `/login` | ⚠️ Out of scope | Documented below as follow-up. For a dev/hobby deployment, MySQL connection limits + bcrypt cost are the only natural backpressure. |
| Account enumeration via `/register` | ⚠️ Accepted | The 409 on duplicate username is intentional (this is a registration flow, not a credential endpoint). |
| Password complexity rules | ⚠️ Out of scope | We enforce `minlength=8` on the client and at the API. Adding a strength meter is a follow-up. |

### Follow-ups (note in the PRD "Risks" section, do NOT implement now)

- Rate-limit `/api/auth/login` and `/api/auth/register` per IP + per username. Easiest: an in-memory LRU map keyed by IP with a token-bucket; for prod, a real limiter (e.g. `@upstash/ratelimit` or a Redis-backed middleware).
- Refresh tokens (rotate the JWT before 7-day expiry) — for now, the 7-day expiry is the only lifetime.
- Password reset flow via email.
- "Remember me" checkbox → 30-day vs 7-day cookie.

---

## 10. File-by-File Change List (ordered)

The implementation agent executes this list top-to-bottom. No two tasks in the same phase modify the same file.

### Phase 0 — Dependencies

| # | File / Command | Agent | Purpose |
| - | -------------- | ----- | ------- |
| 0.1 | `bun add jose bcryptjs` | Backend Developer | Add JWT + password hashing libraries. |
| 0.2 | `bun add -d @types/bcryptjs` | Backend Developer | Add types for bcryptjs. |

### Phase 1 — Schema (sequential — schema + migration + env must agree)

| # | File | Agent | Purpose |
| - | ---- | ----- | ------- |
| 1.1 | `db/migration/002_add_credentials.sql` (new) | Backend Developer | `ALTER TABLE users ADD COLUMN username, password_hash` with unique index. |
| 1.2 | `src/lib/server/db/schema/user.ts` (modify) | Backend Developer | Add `username` + `passwordHash` columns; export `PublicUser` type. Update header comment to mention 002. |
| 1.3 | `src/lib/env.ts` (modify) | Backend Developer | Add `JWT.SECRET` group with min-length check. |
| 1.4 | `.env.example` (modify) | Backend Developer | Add `JWT_SECRET` placeholder + `openssl rand -base64 32` note. |
| 1.5 | `.env` (local, gitignored — agent creates) | Backend Developer | Copy `.env.example` and set a real `JWT_SECRET` for the dev DB. |

### Phase 2 — Server auth (no UI dependencies — can run in parallel with Phase 3)

| # | File | Agent | Purpose |
| - | ---- | ----- | ------- |
| 2.1 | `src/lib/server/auth.ts` (new) | Backend Developer | `hashPassword`, `verifyPassword`, `signJwt`, `verifyJwt`, `getCurrentUser`, `requireAuth`, cookie helpers. |
| 2.2 | `src/hooks.server.ts` (new) | Backend Developer | `handle` hook that calls `getCurrentUser` and assigns to `event.locals.user`. |
| 2.3 | `src/app.d.ts` (modify) | Backend Developer | Augment `App.Locals.user` and `App.PageData.user` with `PublicUser \| null`. |

### Phase 3 — API routes (parallel with each other; depend on Phase 2)

| # | File | Agent | Purpose |
| - | ---- | ----- | ------- |
| 3.1 | `src/routes/api/auth/register/+server.ts` (new) | Backend Developer | `POST` — create user, sign JWT, set cookie. |
| 3.2 | `src/routes/api/auth/login/+server.ts` (new) | Backend Developer | `POST` — verify credentials, sign JWT, set cookie. Generic 401 on failure. |
| 3.3 | `src/routes/api/auth/logout/+server.ts` (new) | Backend Developer | `POST` — clear auth cookie. Idempotent. |
| 3.4 | `src/routes/api/auth/me/+server.ts` (new) | Backend Developer | `GET` — return `locals.user` as JSON. |

### Phase 4 — UI (depends on Phase 2; can be partially parallel with Phase 3)

| # | File / Command | Agent | Purpose |
| - | -------------- | ----- | ------- |
| 4.1 | `bunx shadcn-svelte@latest add login-02` (run) | Frontend Developer | Install the login block + its base-component deps. Note the file the CLI creates. |
| 4.2 | `src/routes/+layout.server.ts` (new) | Frontend Developer | Expose `locals.user` as `data.user` to the client tree. |
| 4.3 | `src/routes/login/+page.svelte` (new) | Frontend Developer | Login + register form (single page, toggle mode), inline error banner, fetch to API, redirect to `?next` or `/dashboard`. |
| 4.4 | `src/routes/dashboard/+page.server.ts` (new) | Frontend Developer | `load` calls `requireAuth`; `actions.logout` clears cookie and 303s. |
| 4.5 | `src/routes/dashboard/+page.svelte` (new) | Frontend Developer | Renders `data.user` fields + a logout form button. |
| 4.6 | `src/routes/+page.svelte` (modify) | Frontend Developer | Add login/dashboard link in the header based on `data.user`. |
| 4.7 | (optional) clean up the `(auth)/login-02/` directory the shadcn CLI created | Frontend Developer | Remove the demo route group once its markup has been moved into `src/routes/login/+page.svelte`. |

### Phase 5 — Migration & verification (always last)

| # | File / Command | Agent | Purpose |
| - | -------------- | ----- | ------- |
| 5.1 | `mysql -u root -p sveltes < db/migration/002_add_credentials.sql` (or DB GUI) | Backend Developer | Apply the schema change to the dev DB. |
| 5.2 | `bun run check` | Backend Developer | Confirm no TypeScript errors. |
| 5.3 | `bun run dev` | Backend Developer | Smoke-test the server starts; hit `/api/auth/me` with no cookie → 401. |
| 5.4 | Manual: register → login → access `/dashboard` → logout | Frontend Developer | End-to-end verification (see §11). |

---

## 11. Verification — End-to-End

Run in order. Each step must pass before moving to the next.

1. **DB applied.** Confirm the columns exist:
   ```sql
   DESCRIBE users;
   -- expect: username VARCHAR(64) NOT NULL, password_hash VARCHAR(255) NOT NULL
   SHOW INDEX FROM users WHERE Key_name = 'users_username_unique';
   ```
2. **Server boots.** `bun run dev` — no `JWT_SECRET` error. `curl -s -i http://localhost:5173/api/auth/me` returns `401`.
3. **Register a user.**
   ```bash
   curl -s -i -X POST http://localhost:5173/api/auth/register \
     -H 'content-type: application/json' \
     -c cookies.txt \
     -d '{"username":"alice","password":"correcthorsebattery","name":"Alice","email":"alice@example.com"}'
   ```
   Expect `201`, JSON body with `user.id`, `user.username: "alice"`, and a `Set-Cookie: auth=...; HttpOnly; SameSite=Lax` header.
4. **Login with same creds.**
   ```bash
   curl -s -i -X POST http://localhost:5173/api/auth/login \
     -H 'content-type: application/json' \
     -c cookies.txt \
     -d '{"username":"alice","password":"correcthorsebattery"}'
   ```
   Expect `200`, fresh `Set-Cookie: auth=...`, and `user` in the body.
5. **Login with wrong password.**
   ```bash
   curl -s -i -X POST http://localhost:5173/api/auth/login \
     -H 'content-type: application/json' \
     -d '{"username":"alice","password":"wrong"}'
   ```
   Expect `401 { "error": "Invalid username or password" }`. No `Set-Cookie`.
6. **Login with unknown username.**
   ```bash
   curl -s -i -X POST http://localhost:5173/api/auth/login \
     -H 'content-type: application/json' \
     -d '{"username":"nobody","password":"x"}'
   ```
   Expect `401` with the **same** generic error message (no enumeration).
7. **Register with taken username.**
   ```bash
   curl -s -i -X POST http://localhost:5173/api/auth/register \
     -H 'content-type: application/json' \
     -d '{"username":"alice","password":"whatever123","name":"X","email":"x@y.com"}'
   ```
   Expect `409 { "error": "Username already taken" }`.
8. **Access /dashboard with cookie.**
   ```bash
   curl -s -i http://localhost:5173/dashboard -b cookies.txt
   ```
   Expect `200` with the dashboard HTML rendering the username.
9. **Access /dashboard without cookie.**
   ```bash
   curl -s -i http://localhost:5173/dashboard
   ```
   Expect `303` to `/login?next=%2Fdashboard`.
10. **/api/auth/me with cookie.**
    ```bash
    curl -s -i http://localhost:5173/api/auth/me -b cookies.txt
    ```
    Expect `200 { "user": { "id": ..., "username": "alice", ... } }`.
11. **Logout.**
    ```bash
    curl -s -i -X POST http://localhost:5173/api/auth/logout -b cookies.txt -c cookies.txt
    ```
    Expect `200 { "ok": true }`, `Set-Cookie: auth=; Max-Age=0`.
12. **/api/auth/me after logout.**
    ```bash
    curl -s -i http://localhost:5173/api/auth/me -b cookies.txt
    ```
    Expect `401 { "user": null }`.
13. **Browser smoke test.**
    - Open `http://localhost:5173/login`, register a new user.
    - Confirm redirect to `/dashboard` and the user fields render.
    - Click "Log out" → redirect to `/login`.
    - Visit `/dashboard` while logged out → bounced to `/login?next=/dashboard`.
    - Log back in via the form → bounced back to `/dashboard`.

If all 13 pass, the feature is complete.

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Existing dev rows break the `ALTER` (NOT NULL with no default) | Low — dev-only | Medium | Implementation agent asks the user to either (a) `TRUNCATE users` for a clean reset, or (b) backfill with a placeholder bcrypt hash. Documented in §1. |
| `jose` v5 vs v6 API drift | Low | Low | Pin to `jose@^5` if installation reports v6 surprises; the API used (`SignJWT`, `jwtVerify`) is stable across both. |
| `bcryptjs` slower than native `bcrypt` in prod | Low | Low | Acceptable for a dev/hobby deployment. The single hash/compare per login is not hot-path. Switch to `@node-rs/bcrypt` later — only `hashPassword`/`verifyPassword` in `src/lib/server/auth.ts` change. |
| Login-02 block file path differs across shadcn-svelte versions | Low | Medium | Phase 4.1 records the actual path the CLI created; the rest of Phase 4 references that path. |
| `SameSite=Lax` insufficient if we later add cross-site form posts | Low | Low | The `/api/auth/*` endpoints are JSON-only (require `content-type: application/json`). Cross-origin HTML forms cannot set that header without a CORS preflight, which we do not allow. |

## Rollback Strategy

Reverting this feature cleanly:

1. Delete `src/routes/api/auth/`, `src/routes/login/`, `src/routes/dashboard/`, `src/routes/+layout.server.ts`, `src/hooks.server.ts`.
2. Revert `src/app.d.ts`, `src/lib/server/db/schema/user.ts`, `src/lib/env.ts`, `src/routes/+page.svelte`, `package.json`, `bun.lock`, `.env.example`.
3. Run `db/migration/002_rollback_credentials.sql`:
   ```sql
   ALTER TABLE `users`
       DROP INDEX `users_username_unique`,
       DROP COLUMN `password_hash`,
       DROP COLUMN `username`;
   ```
4. `bun install` to remove `jose` + `bcryptjs` + `@types/bcryptjs`.

No data loss outside the `username` and `password_hash` columns (which are all-NULLable conceptually — they only ever held new auth rows).

## Version History

| Version | Date       | Summary |
| ------- | ---------- | ------- |
| 0.1.0   | 2026-06-17 | Initial draft. |
