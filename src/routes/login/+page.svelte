<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Field,
		FieldGroup,
		FieldLabel
	} from '$lib/components/ui/field';
	import { safeNext } from '$lib/safe-next';

	type Mode = 'login' | 'register';

	let mode = $state<Mode>('login');
	let username = $state('');
	let password = $state('');
	let name = $state('');
	let email = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	const isLogin = $derived(mode === 'login');
	const title = $derived(isLogin ? 'Log in' : 'Create an account');
	const description = $derived(
		isLogin
			? 'Enter your username and password to continue.'
			: 'Pick a username and password to get started.'
	);
	const submitLabel = $derived(
		submitting ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'
	);

	function toggleMode() {
		mode = isLogin ? 'register' : 'login';
		error = null;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		submitting = true;
		try {
			const url = isLogin ? '/api/auth/login' : '/api/auth/register';
			const body = isLogin
				? { username, password }
				: { username, password, name, email };

			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				error = data.error ?? 'Something went wrong. Please try again.';
				return;
			}

			await invalidateAll(); // re-run +layout.server.ts so data.user updates
			const next = safeNext(page.url.searchParams.get('next'));
			await goto(next, { invalidateAll: true });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error';
		} finally {
			submitting = false;
		}
	}
</script>

<!--
	Markup adapted from shadcn-svelte login-02 block.
	Single-column card on muted background. Username + password only.
	Register mode shows name + email fields. Uses Field* components
	installed by the block (Card was not pulled in by the block in
	this shadcn-svelte version, so the card surface is hand-rolled
	with Tailwind).
-->
<main class="flex min-h-svh items-center justify-center bg-muted p-6">
	<div
		class="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
	>
		<FieldGroup>
			<div class="flex flex-col items-center gap-1 text-center">
				<h1 class="text-2xl font-bold">{title}</h1>
				<p class="text-muted-foreground text-sm text-balance">
					{description}
				</p>
			</div>

			<form class="contents" onsubmit={submit}>
				<Field>
					<FieldLabel for="username">Username</FieldLabel>
					<Input
						id="username"
						name="username"
						autocomplete="username"
						required
						bind:value={username}
					/>
				</Field>
				<Field>
					<FieldLabel for="password">Password</FieldLabel>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						minlength={8}
						bind:value={password}
					/>
				</Field>
				{#if !isLogin}
					<Field>
						<FieldLabel for="name">Name</FieldLabel>
						<Input
							id="name"
							name="name"
							autocomplete="name"
							required
							bind:value={name}
						/>
					</Field>
					<Field>
						<FieldLabel for="email">Email</FieldLabel>
						<Input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							bind:value={email}
						/>
					</Field>
				{/if}
				{#if error}
					<p role="alert" class="text-sm text-destructive">{error}</p>
				{/if}
				<Field>
					<Button type="submit" disabled={submitting} class="w-full">
						{submitLabel}
					</Button>
				</Field>
			</form>
		</FieldGroup>

		<button
			type="button"
			class="text-muted-foreground block w-full text-center text-sm underline-offset-4 hover:underline"
			onclick={toggleMode}
		>
			{isLogin ? 'Need an account? Sign up' : 'Already have an account? Log in'}
		</button>
	</div>
</main>
