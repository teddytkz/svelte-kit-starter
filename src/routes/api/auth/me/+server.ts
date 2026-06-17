// src/routes/api/auth/me/+server.ts
//
// GET /api/auth/me
// 200 → { user: { id, username, name, email } }
// 401 → { user: null }
//
// `event.locals.user` is already populated by `hooks.server.ts`.

import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) {
		return json({ user: null }, { status: 401 });
	}
	return json({ user: event.locals.user });
};
