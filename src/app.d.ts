// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { PublicUser } from '$lib/server/db/schema/user';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: PublicUser | null;
		}
		// `user` is populated by `+layout.server.ts` (returns `{ user: locals.user }`).
		// Marked optional so pages without a `+page.ts` (or pre-layout) type-check.
		interface PageData {
			user?: PublicUser | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
