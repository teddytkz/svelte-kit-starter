import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

/**
 * Factory: creates a fresh QueryClient with sensible defaults.
 * Used for both server and browser clients.
 */
function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Disable client-driven fetching during SSR so queries do not
				// continue executing after HTML is flushed to the client.
				// `prefetchQuery()` still works regardless of this flag.
				enabled: browser,
				// Avoid immediate refetch right after hydration.
				staleTime: 60 * 1000
			}
		}
	});
}

// Module-singleton in the browser, fresh per request on the server.
let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
	if (browser) {
		browserQueryClient ??= makeQueryClient();
		return browserQueryClient;
	}
	return makeQueryClient();
}
