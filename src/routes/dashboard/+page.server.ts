// src/routes/dashboard/+page.server.ts
//
// Protected dashboard route. Demonstrates the auth flow end-to-end:
// - `load` calls `requireAuth` (throws redirect(303, '/login?next=...')
//   if no valid session).
// - `actions.logout` clears the auth cookie and redirects to `/`. The
//   user is no longer authenticated, so the old flow
//   (303 → /dashboard → load → 303 → /login?next=...) was two extra
//   redirects for no benefit. One redirect is enough. This is the
//   SvelteKit form-action idiom: no JS, no client round-trip.

import { redirect } from '@sveltejs/kit';
import { clearAuthCookie, requireAuth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const user = requireAuth(event); // throws redirect(303, '/login?next=...') if not authed
	return { user };
};

export const actions: Actions = {
	logout: async (event) => {
		clearAuthCookie(event);
		throw redirect(303, '/');
	}
};
