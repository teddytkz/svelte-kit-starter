// Client-safe `?next=` validator. SvelteKit blocks `$lib/server/*` from
// .svelte files; this has no server-only deps.

export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
	if (typeof next !== 'string') return fallback;
	if (!next.startsWith('/')) return fallback;
	// Reject protocol-relative (//evil.com) and backslash-prefixed paths
	// (browsers normalize \ to /, so /\evil.com is a same-origin escape).
	if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
	return next;
}
