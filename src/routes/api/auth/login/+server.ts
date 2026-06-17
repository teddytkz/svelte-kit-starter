// src/routes/api/auth/login/+server.ts
//
// POST /api/auth/login
// Body: { username, password }
// 200 → { user: { id, username, name, email } } + Set-Cookie auth=<jwt>
// 400 → { error: <validation msg> }
// 401 → { error: "Invalid username or password" }  (generic — no enumeration)

import { eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema/user';
import {
	cookieOptions,
	DUMMY_BCRYPT_HASH,
	isValidUsername,
	setAuthCookie,
	signJwt,
	verifyPassword
} from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { username, password } = (body ?? {}) as {
		username?: unknown;
		password?: unknown;
	};

	if (typeof username !== 'string' || !isValidUsername(username.trim())) {
		return json({ error: 'Invalid username or password' }, { status: 400 });
	}
	if (typeof password !== 'string' || password.length < 1) {
		return json({ error: 'Invalid username or password' }, { status: 400 });
	}

	const normalizedUsername = username.trim().toLowerCase();

	try {
		const rows = await db
			.select({
				id: users.id,
				username: users.username,
				name: users.name,
				email: users.email,
				passwordHash: users.passwordHash
			})
			.from(users)
			.where(eq(users.username, normalizedUsername))
			.limit(1);

		const user = rows[0];

		// Generic failure: same message whether user exists, password mismatches,
		// or password hash is malformed. Do NOT leak which side failed.
		if (!user) {
			// Equalize timing with the verifyPassword call in the success
			// path so a missing username can't be distinguished by response
			// time. The result is discarded.
			await verifyPassword(password, DUMMY_BCRYPT_HASH);
			return json({ error: 'Invalid username or password' }, { status: 401 });
		}
		const ok = await verifyPassword(password, user.passwordHash);
		if (!ok) {
			return json({ error: 'Invalid username or password' }, { status: 401 });
		}

		const token = await signJwt({ sub: user.id, username: user.username });
		setAuthCookie(event, token);

		return json({
			user: { id: user.id, username: user.username, name: user.name, email: user.email }
		});
	} catch (err) {
		console.error('login error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
