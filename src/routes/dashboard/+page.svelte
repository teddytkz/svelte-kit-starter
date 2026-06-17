<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="mx-auto max-w-2xl space-y-6 p-6">
	<header class="flex items-center justify-between">
		<h1 class="text-3xl font-semibold">Dashboard</h1>
		<form method="POST" action="?/logout">
			<Button type="submit" variant="outline">Log out</Button>
		</form>
	</header>
	<section class="rounded-lg border p-4">
		<h2 class="font-medium">Signed in as</h2>
		<dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
			<dt class="text-muted-foreground">ID</dt>
			<dd>{data.user.id}</dd>
			<dt class="text-muted-foreground">Username</dt>
			<dd>{data.user.username}</dd>
			<dt class="text-muted-foreground">Name</dt>
			<dd>{data.user.name}</dd>
			<dt class="text-muted-foreground">Email</dt>
			<dd>{data.user.email}</dd>
		</dl>
	</section>
</main>
