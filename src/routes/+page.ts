import { dehydrate } from '@tanstack/svelte-query';
import { getQueryClient } from '$lib/query-client';
import { postsQueryOptions } from '$lib/queries';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const queryClient = getQueryClient();

	// Prefetch using SvelteKit's `fetch` so cookies / relative URLs work.
	// The same options object is reused client-side, so the cache key matches
	// and the client query hydrates without a network round-trip.
	await queryClient.prefetchQuery(postsQueryOptions(fetch));

	return { dehydratedState: dehydrate(queryClient) };
};
