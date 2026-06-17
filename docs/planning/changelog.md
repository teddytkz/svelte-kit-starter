# Changelog

All notable changes to this project will be documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- [2026-06-16] PRD: SvelteKit + Bun + TypeScript project setup plan (`docs/planning/PRD-sveltekit-bun-setup.md`)
- [2026-06-17] Dep: `@sveltejs/adapter-node` 5.5.4 — production SSR server (Node/Bun runnable). Replaces `adapter-auto` (M2).
- [2026-06-17] Scripts: `bun run start` runs `bun ./build/index.js` (Bun runtime, no Node required); `start:node` runs `node build` for hosts without Bun; `compile` produces a single-binary `sveltes-prod` via `bun build --compile` (M3).
- [2026-06-17] Doc: setup guide for `@sveltejs/adapter-node` (`docs/deployment/adapter-node.md`) (M2).
- [2026-06-17] Doc: "Running without Node.js" section — three runtime modes (Bun, single-binary, Node) with cross-compile example (M3).

### Changed

- [2026-06-17] Config: `vite.config.ts` switched from `@sveltejs/adapter-auto` to `@sveltejs/adapter-node` with `out: 'build'`. Build output moves from `.svelte-kit/output/` to `build/` (the new `outDir`), and the `build/` directory is now a self-contained Node server (`build/index.js` + `build/handler.js` + `build/client/`) (M2).

### Fixed

- [2026-06-16] Lint: scaffolded files (`.prettierrc`, `eslint.config.js`, `README.md`, and assorted `.github/` docs) were not Prettier-formatted, causing `bun run lint` to fail. Resolved by running `bun run format` (C1).
- [2026-06-16] PRD: Phase 3 task 3.2 acceptance criterion referenced a `build/` directory, but `adapter-auto` (no platform detected) writes to `.svelte-kit/output/{client,server}/`. Reworded the AC to reference the correct path and note that switching adapters (e.g. `adapter-node`) will redirect output to `build/` (M1).

### Removed

- [2026-06-17] Dep: `@sveltejs/adapter-auto` — no longer needed; `adapter-node` is the explicit production target (M2).
