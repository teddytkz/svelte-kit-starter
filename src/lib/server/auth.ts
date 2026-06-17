// src/lib/server/auth.ts
//
// Server-only auth utilities for JWT-based session auth.
// - Hashes passwords with bcryptjs.
// - Signs + verifies JWTs (HS256) with `env.JWT.SECRET`.
// - Provides a cookie-based session that `hooks.server.ts` populates on every
//   request into `event.locals.user` (typed as `PublicUser | null`).
//
// Marked server-only by living under `src/lib/server/` — SvelteKit refuses to
// bundle it into client code.

import { dev } from '$app/environment';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '$lib/env';
import { db } from '$lib/server/db';
import { users, type PublicUser } from '$lib/server/db/schema/user';

const SALT_ROUNDS = 10;
const COOKIE_NAME = 'auth';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7; // 7d
const USERNAME_RE = /^[a-z0-9_-]{3,32}$/i;

// Precomputed at module load; the comparison result is discarded. This
// equalizes the response time of the login endpoint when the username is
// not found, closing the timing-oracle username-enumeration vector.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', SALT_ROUNDS);

export const DUMMY_BCRYPT_HASH = DUMMY_HASH;

export const COOKIE = COOKIE_NAME;
export const COOKIE_MAX_AGE = COOKIE_MAX_AGE_S;

// Read the secret once at module load. Throws on startup if missing — fail fast.
const SECRET = new TextEncoder().encode(env.JWT.SECRET); // requires env.JWT.SECRET

export interface JwtClaims {
	sub: string; // user id, stringified
	username: string;
	exp?: number; // set by jose
}

export function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: !dev, // false in dev (http://localhost), true in prod
		maxAge: COOKIE_MAX_AGE_S
	};
}

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
		// Cast through `unknown`: JWTPayload has no required `username` key, so the
		// narrow above is the only thing standing between the union types.
		return payload as unknown as JwtClaims;
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
	const rows = await db
		.select({ id: users.id, username: users.username, name: users.name, email: users.email })
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
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
