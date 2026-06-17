// src/routes/+layout.server.ts
//
// Expose `event.locals.user` (populated by hooks.server.ts) to the entire
// client tree as `data.user`. Every page can read `data.user.username` from
// $props() without re-fetching.

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user };
};
