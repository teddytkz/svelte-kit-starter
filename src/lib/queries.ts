import { queryOptions } from '@tanstack/svelte-query';

export type Post = {
	userId: number;
	id: number;
	title: string;
	body: string;
};

async function fetchPosts(fetchFn: typeof fetch): Promise<Post[]> {
	const res = await fetchFn('https://jsonplaceholder.typicode.com/posts?_limit=5');
	if (!res.ok) throw new Error(`Failed to load posts: ${res.status}`);
	return (await res.json()) as Post[];
}

/**
 * Single source of truth for the posts query.
 * Re-used by `+page.ts` (server prefetch) and `+page.svelte` (client query)
 * so cache keys line up and hydration is a no-op fetch.
 */
export const postsQueryOptions = (fetchFn: typeof fetch = fetch) =>
	queryOptions({
		queryKey: ['posts'] as const,
		queryFn: () => fetchPosts(fetchFn)
	});
