// src/hooks.server.ts
//
// Single request hook. Populates `event.locals.user` on every request from the
// `auth` cookie (if present + valid). No path-based global enforcement —
// protected routes opt in via `requireAuth` in their `+page.server.ts`.

import type { Handle } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await getCurrentUser(event);
	return resolve(event);
};
