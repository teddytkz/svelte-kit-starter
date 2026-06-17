// src/routes/api/auth/register/+server.ts
//
// POST /api/auth/register
// Body: { username, password, name, email }
// 201 → { user: { id, username, name, email } } + Set-Cookie auth=<jwt>
// 400 → { error: <validation msg> }
// 409 → { error: "Username already taken" }

import { eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema/user';
import {
	cookieOptions,
	hashPassword,
	isValidUsername,
	setAuthCookie,
	signJwt
} from '$lib/server/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: RequestHandler = async (event) => {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { username, password, name, email } = (body ?? {}) as {
		username?: unknown;
		password?: unknown;
		name?: unknown;
		email?: unknown;
	};

	// --- validation (400) ---
	if (typeof username !== 'string' || !isValidUsername(username.trim())) {
		return json({ error: 'Username must be 3–32 chars: letters, digits, _ or -' }, { status: 400 });
	}
	if (typeof password !== 'string' || password.length < 8) {
		return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
	}
	if (typeof name !== 'string' || name.length < 1 || name.length > 255) {
		return json({ error: 'Name must be 1–255 characters' }, { status: 400 });
	}
	if (typeof email !== 'string') {
		return json({ error: 'Invalid email address' }, { status: 400 });
	}
	const normalizedEmail = email.trim().toLowerCase();
	if (!EMAIL_RE.test(normalizedEmail)) {
		return json({ error: 'Invalid email address' }, { status: 400 });
	}
	const normalizedUsername = username.trim().toLowerCase();

	try {
		// --- duplicate check (409) ---
		const existing = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, normalizedUsername))
			.limit(1);
		if (existing.length > 0) {
			return json({ error: 'Username already taken' }, { status: 409 });
		}

		// --- insert ---
		const passwordHash = await hashPassword(password);
		const inserted = await db
			.insert(users)
			.values({
				username: normalizedUsername,
				passwordHash,
				name: name.trim(),
				email: normalizedEmail
			})
			.$returningId();
		const insertId = inserted[0]?.id;
		if (typeof insertId !== 'number' || !Number.isInteger(insertId) || insertId <= 0) {
			return json({ error: 'Failed to create user' }, { status: 500 });
		}

		// --- session ---
		const token = await signJwt({ sub: insertId, username: normalizedUsername });
		setAuthCookie(event, token);

		return json(
			{
				user: {
					id: insertId,
					username: normalizedUsername,
					name: name.trim(),
					email: normalizedEmail
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('register error:', err);
		// The unique key on users.username is authoritative. If a concurrent
		// request inserted the same username between our existence check
		// and our INSERT, the DB raises ER_DUP_ENTRY (MySQL: errno 1062,
		// sqlState 23000). Treat as 409.
		const e = err as { code?: string; errno?: number; sqlState?: string };
		if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062 || e?.sqlState === '23000') {
			return json({ error: 'Username already taken' }, { status: 409 });
		}
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
