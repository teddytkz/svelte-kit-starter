// src/routes/api/auth/logout/+server.ts
//
// POST /api/auth/logout
// Idempotent: clears the `auth` cookie. Always 200.

import { json, type RequestHandler } from '@sveltejs/kit';
import { clearAuthCookie } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	clearAuthCookie(event);
	return json({ ok: true });
};
