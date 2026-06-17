/**
 * src/lib/env.ts
 *
 * Centralized, typed, validated reader for `process.env`.
 * Bun auto-loads `.env` at startup, so no `dotenv` import is needed.
 *
 * ⚠️  This module currently exposes server-side secrets (DB credentials).
 *     Do not import it from client-side code (`.svelte`, `+page.ts`, etc.).
 *     If you need client-safe env vars, expose them via SvelteKit's
 *     `$env/static/public` (variables prefixed with `PUBLIC_`).
 *
 * @example
 *   import { env } from '$lib/env';
 *   const host = env.DB.URL;
 */

function required(key: string): string {
	const value = process.env[key];
	if (value === undefined) {
		throw new Error(`Missing required env var: ${key}. Add it to your .env file.`);
	}
	return value;
}

function requiredNumber(key: string): number {
	const value = required(key);
	const num = Number(value);
	if (!Number.isFinite(num)) {
		throw new Error(`Env var ${key} must be a number, got: ${value}`);
	}
	return num;
}

/**
 * Typed, validated env vars. Add new groups here as the app grows.
 */
export const env = {
	DB: {
		URL: required('DB_URL'),
		PORT: requiredNumber('DB_PORT'),
		USER: required('DB_USER'),
		PASS: required('DB_PASS'),
		NAME: required('DB_NAME')
	},
	JWT: {
		SECRET: (() => {
			const v = required('JWT_SECRET');
			// HS256 requires ≥256 bits of secret (RFC 7518 §3.2). 32 ASCII
			// chars is the minimum. Generate with: openssl rand -base64 32
			if (v.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
			return v;
		})()
	}
} as const;
