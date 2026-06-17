# Authentication

> JWT-based username + password authentication for SvelteKit 2 / Svelte 5, backed by Drizzle ORM + MySQL. Sessions ride in a single `httpOnly` cookie; protected routes opt in with `requireAuth` in their `+page.server.ts`.

**Last updated:** 2026-06-17
**Status:** Shipped — see [login-jwt-auth.md](planning/login-jwt-auth.md) for the design record and [fix-review-findings.md](planning/fix-review-findings.md) for the security hardening pass.

---

## Overview

The app signs users in with a username and password, mints a 7-day HS256 JWT, and stores it in an `HttpOnly`, `SameSite=Lax` cookie named `auth`. On every request, `src/hooks.server.ts` populates `event.locals.user` (or `null`); any `+page.server.ts` that wants the user to be signed in calls `requireAuth`, which throws a 303 redirect to `/login?next=…` when nobody is.

No global middleware enforces auth. New pages and endpoints are public by default — protection is opt-in at the route level.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Bun | ≥ 1.2 | Runtime, package manager, and dev server |
| Node | ≥ 20 | `bun run build` uses Node for the postbuild `analyse` fork |
| MySQL | ≥ 8.0.29 | Required for the `ADD COLUMN IF NOT EXISTS` clause in `002_add_credentials.sql` |
| MariaDB | ≥ 10.0.2 | Drop-in alternative; same `IF NOT EXISTS` support |

> MariaDB 10.0.2 and MySQL 8.0.29 are the floor for `IF NOT EXISTS` on `ALTER TABLE … ADD COLUMN`. Older versions will fail migration 002 — apply it manually without the clause if you must.

---

## Setup

1. **Copy the env template:**

   ```bash
   cp .env.example .env
   ```

2. **Fill in the database variables** in `.env`:

   ```bash
   DB_URL="localhost"
   DB_PORT="3306"
   DB_USER="root"
   DB_PASS="your-mysql-password"
   DB_NAME="sveltes"
   ```

   Bun auto-loads `.env` on startup. `vite.config.ts` also re-injects it into `process.env` so the SvelteKit build and the postbuild `analyse` fork see the same values.

3. **Generate a JWT signing secret.** The server refuses to start if this is shorter than 32 characters:

   ```bash
   openssl rand -base64 32
   ```

   Paste the output as `JWT_SECRET=…` in `.env`.

4. **Apply the migrations.** The project does not use `drizzle-kit`; run the SQL files in order:

   ```bash
   mysql -h "$DB_URL" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
       < db/migration/001_init.sql
   mysql -h "$DB_URL" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
       < db/migration/002_add_credentials.sql
   ```

   `002_add_credentials.sql` is idempotent on MySQL 8.0.29+ / MariaDB 10.0.2+ thanks to `ADD COLUMN IF NOT EXISTS`.

5. **Install dependencies** (if you have not already):

   ```bash
   bun install
   ```

6. **Run the app:**

   ```bash
   bun run dev          # dev server, default port 5173
   # — or —
   bun run build && bun ./build/index.js   # production (adapter-node)
   ```

---

## Try it

Save the cookie jar between calls so the auth cookie persists:

```bash
COOKIES=$(mktemp)
```

### Register

```bash
curl -i -c "$COOKIES" -X POST http://127.0.0.1:5173/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"hunter22","name":"Alice","email":"alice@example.com"}'
```

Expect `HTTP/1.1 201 Created` and a `Set-Cookie: auth=…; HttpOnly; SameSite=Lax; Path=/` header. Body:

```json
{
  "user": {
    "id": 1,
    "username": "alice",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### Login

```bash
curl -i -c "$COOKIES" -b "$COOKIES" -X POST http://127.0.0.1:5173/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"hunter22"}'
```

Expect `200 OK` + a fresh `Set-Cookie: auth=…` header. A wrong password returns `401` with the generic body — login never reveals whether the username exists:

```json
{ "error": "Invalid username or password" }
```

### Me

```bash
curl -i -b "$COOKIES" http://127.0.0.1:5173/api/auth/me
```

Expect `200 OK` and the public user shape:

```json
{
  "user": {
    "id": 1,
    "username": "alice",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

Without a valid cookie, expect `401` and `{ "user": null }`.

### Logout

```bash
curl -i -b "$COOKIES" -X POST http://127.0.0.1:5173/api/auth/logout
```

Expect `200 OK`, `{"ok":true}`, and a `Set-Cookie: auth=; Max-Age=0; Path=/` that clears the cookie in your jar.

---

## Browser flow

1. Visit `http://127.0.0.1:5173/`. The header shows **Log in**.
2. Click **Log in** → land on `/login`.
3. Either fill in an existing username + password (top-right toggle is **Need an account? Sign up**), or switch to register mode and supply `name` + `email` as well.
4. On success, the form runs `invalidateAll()` (so the layout's `data.user` updates) and navigates to `safeNext(page.url.searchParams.get('next'))` — default `/dashboard`.
5. `/dashboard` shows your id, username, name, and email. **Log out** posts a form action that clears the cookie and 303-redirects to `/`.
6. While signed out, navigating to `/dashboard` 303-redirects to `/login?next=%2Fdashboard`. After signing in there, you bounce back to the original target.

---

## Protecting a new route

Opt-in protection lives in the `+page.server.ts` `load` function. Call `requireAuth(event)` and the helper throws a `redirect(303, '/login?next=…')` if no user is on `event.locals`:

```ts
// src/routes/my-page/+page.server.ts
import { requireAuth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
    const user = requireAuth(event);
    return { secret: 'stuff for ' + user.username };
};
```

For client-side `?next=` handling, use the client-safe validator at [`src/lib/safe-next.ts`](../src/lib/safe-next.ts). It rejects protocol-relative (`//evil.com`) and backslash-prefixed (`/\evil.com`) paths that browsers normalize into same-origin escapes:

```ts
import { safeNext } from '$lib/safe-next';
import { goto } from '$app/navigation';
import { page } from '$app/state';

await goto(safeNext(page.url.searchParams.get('next')));
```

For per-endpoint protection, mirror `src/routes/api/auth/me/+server.ts` (read `event.locals.user`) or throw a `401` from your handler. See the [API reference](api/auth.md) for the canonical response shapes.

---

## Production checklist

- [ ] `JWT_SECRET` is at least 32 random bytes from `openssl rand -base64 32` — not the placeholder in `.env.example`.
- [ ] `NODE_ENV=production` when running `bun ./build/index.js` so the `auth` cookie is marked `Secure`.
- [ ] HTTPS terminates at your reverse proxy (Caddy, nginx, ALB, etc.). Without HTTPS, `Secure` cookies are dropped by the browser.
- [ ] `bun audit` runs clean before each release.
- [ ] Migrations are applied out-of-band (CI step or manual run); the app does not auto-migrate on boot.
- [ ] Reverse proxy sets security headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`). The app does not set them — see [What's NOT in this release](#whats-not-in-this-release).

---

## What's NOT in this release

These are intentional gaps — track them before exposing the app to a real threat model:

- **Rate limiting / brute-force protection** on `/api/auth/login` and `/api/auth/register`.
- **JWT revocation** — there is no `tokenVersion` column; once a JWT is issued, it is valid for 7 days even if you rotate the user's password.
- **Email-based password reset** flows.
- **Two-factor auth (TOTP / WebAuthn)** and **OAuth** providers.
- **Audit log** of sign-in / sign-out / failed-login events.
- **Account-enumeration protection on `register`** — a duplicate username returns `409 Username already taken`. A future pass should collapse this into the same generic `400` shape login uses.
- **Security headers (CSP, HSTS, `X-Frame-Options`, etc.)** — apply at the reverse proxy.
- **CSRF tokens for cross-site form posts** — `SameSite=Lax` cookies provide the current baseline defense, but a banking app would add explicit CSRF tokens on state-changing endpoints.

For the security decisions that *are* in scope (constant-time login, dummy bcrypt, no enumeration on login, `HttpOnly` + `SameSite=Lax` cookies, secrets in `.env`), see [fix-review-findings.md](planning/fix-review-findings.md).

---

## Source map

| File | Role |
|------|------|
| [src/lib/server/auth.ts](../src/lib/server/auth.ts) | Hashing, JWT sign/verify, cookie helpers, `requireAuth`, `findUserById` |
| [src/lib/safe-next.ts](../src/lib/safe-next.ts) | Client-safe `?next=` validator |
| [src/lib/env.ts](../src/lib/env.ts) | Typed env loading (with `JWT_SECRET` ≥ 32-char floor) |
| [src/hooks.server.ts](../src/hooks.server.ts) | Populates `event.locals.user` on every request |
| [src/lib/server/db/schema/user.ts](../src/lib/server/db/schema/user.ts) | `users` table — `username`, `passwordHash`, etc. |
| [src/routes/api/auth/register/+server.ts](../src/routes/api/auth/register/+server.ts) | `POST /api/auth/register` |
| [src/routes/api/auth/login/+server.ts](../src/routes/api/auth/login/+server.ts) | `POST /api/auth/login` (generic 401, dummy bcrypt) |
| [src/routes/api/auth/logout/+server.ts](../src/routes/api/auth/logout/+server.ts) | `POST /api/auth/logout` |
| [src/routes/api/auth/me/+server.ts](../src/routes/api/auth/me/+server.ts) | `GET /api/auth/me` |
| [src/routes/login/+page.svelte](../src/routes/login/+page.svelte) | Login / register form (uses `safeNext`) |
| [src/routes/dashboard/+page.server.ts](../src/routes/dashboard/+page.server.ts) | `requireAuth` + form-action `logout` |
| [src/routes/+layout.server.ts](../src/routes/+layout.server.ts) | Exposes `data.user` to every page |
| [db/migration/002_add_credentials.sql](../db/migration/002_add_credentials.sql) | Idempotent `ADD COLUMN IF NOT EXISTS` |
| [vite.config.ts](../vite.config.ts) | Injects `.env` into `process.env` for dev + build |
