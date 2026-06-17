# Changelog

All notable changes to this project will be documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- [2026-06-17] Plan: JWT login (username + password) with shadcn-svelte login-02 block (`docs/planning/login-jwt-auth.md`)

- [2026-06-16] PRD: SvelteKit + Bun + TypeScript project setup plan (`docs/planning/PRD-sveltekit-bun-setup.md`)
- [2026-06-17] Dep: `@sveltejs/adapter-node` 5.5.4 — production SSR server (Node/Bun runnable). Replaces `adapter-auto` (M2).
- [2026-06-17] Dep: `@tanstack/svelte-query` ^5 — server-state cache + `createQuery` for the routes. SSR-safe provider pattern in `src/routes/+layout.{ts,svelte}` and `src/lib/query-client.ts`.
- [2026-06-17] Dep (dev): `@tanstack/svelte-query-devtools` ^5 — floating dev panel, mounted only when `dev` is true.
- [2026-06-17] Demo: `src/routes/+page.svelte` now renders a `createQuery` against `jsonplaceholder.typicode.com/posts?_limit=5`, prefetched in `+page.ts` using SvelteKit's `event.fetch` and rehydrated on the client. Verifies the full SSR ↔ client cache flow.
- [2026-06-17] Lib: `src/lib/queries.ts` — shared `queryOptions` helper so server and client share one `queryKey`/`queryFn` definition.
- [2026-06-17] Scripts: `bun run start` runs `bun ./build/index.js` (Bun runtime, no Node required); `start:node` runs `node build` for hosts without Bun; `compile` produces a single-binary `sveltes-prod` via `bun build --compile` (M3).
- [2026-06-17] Doc: setup guide for `@sveltejs/adapter-node` (`docs/deployment/adapter-node.md`) (M2).
- [2026-06-17] Doc: "Running without Node.js" section — three runtime modes (Bun, single-binary, Node) with cross-compile example (M3).

### Changed

- [2026-06-17] Config: `vite.config.ts` switched from `@sveltejs/adapter-auto` to `@sveltejs/adapter-node` with `out: 'build'`. Build output moves from `.svelte-kit/output/` to `build/` (the new `outDir`), and the `build/` directory is now a self-contained Node server (`build/index.js` + `build/handler.js` + `build/client/`) (M2).

### Fixed

- [2026-06-17] Fix plan: lazy / build-safe MySQL connection — switch `$lib/server/db` from `mysql2/promise` (eager) to callback `mysql2` (lazy) so `bun run build` and `bun run dev` work without a running MySQL daemon (`docs/planning/fix-lazy-db-connection.md`).
- [2026-06-17] Fix plan: follow-up to the lazy-DB fix — callback `mysql2.createConnection` is synchronous but the constructor still fires the TCP handshake in the background, so on failure the `Connection` emits `'error'` and the unhandled event kills the process. Subscribe to `'error'` in `$lib/server/db/index.ts` (`docs/planning/fix-mysql2-error-listener.md`).
- [2026-06-17] Fix plan: review findings on the JWT auth feature — open-redirect via `?next=` (validate with `safeNext` in a new client-safe `src/lib/safe-next.ts`); login timing oracle (precomputed `DUMMY_BCRYPT_HASH` + dummy `bcrypt.compare` in not-found branch); TOCTOU race in `/api/auth/register` (catch `ER_DUP_ENTRY` → 409); migration `002_add_credentials.sql` rewritten with `ADD COLUMN IF NOT EXISTS` / `ADD UNIQUE KEY IF NOT EXISTS`; JWT secret minimum 16 → 32 chars; logout redirects to `/` (not `/dashboard`); DB error listener logs to stderr (`docs/planning/fix-review-findings.md`).
- [2026-06-16] Lint: scaffolded files (`.prettierrc`, `eslint.config.js`, `README.md`, and assorted `.github/` docs) were not Prettier-formatted, causing `bun run lint` to fail. Resolved by running `bun run format` (C1).
- [2026-06-16] PRD: Phase 3 task 3.2 acceptance criterion referenced a `build/` directory, but `adapter-auto` (no platform detected) writes to `.svelte-kit/output/{client,server}/`. Reworded the AC to reference the correct path and note that switching adapters (e.g. `adapter-node`) will redirect output to `build/` (M1).

### Removed

- [2026-06-17] Dep: `@sveltejs/adapter-auto` — no longer needed; `adapter-node` is the explicit production target (M2).
