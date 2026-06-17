<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw } from '@lucide/svelte';
	import { postsQueryOptions } from '$lib/queries';

	const posts = createQuery(() => postsQueryOptions(fetch));
</script>

<main class="mx-auto max-w-2xl space-y-4 p-6">
	<header class="flex items-center justify-between">
		<h1 class="text-3xl font-semibold">Latest Posts</h1>
		<Button
			variant="outline"
			size="icon"
			onclick={() => posts.refetch()}
			disabled={posts.isFetching}
			aria-label="Refetch posts"
		>
			<RefreshCw class={posts.isFetching ? 'animate-spin' : ''} />
		</Button>
	</header>

	{#if posts.isPending}
		<p class="text-muted-foreground">Loading…</p>
	{:else if posts.isError}
		<p class="text-destructive">Error: {posts.error.message}</p>
	{:else if posts.isSuccess}
		<ul class="space-y-3">
			{#each posts.data as post (post.id)}
				<li class="rounded-lg border p-4">
					<h2 class="font-medium capitalize">{post.title}</h2>
					<p class="text-muted-foreground text-sm">{post.body}</p>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style lang="postcss">
	@reference 'tailwindcss';
	:global(html) {
		background-color: theme(--color-gray-100);
	}
</style>
