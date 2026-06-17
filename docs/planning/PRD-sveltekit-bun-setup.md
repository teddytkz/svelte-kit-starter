# PRD: SvelteKit + Bun + TypeScript Project Setup

**Version:** 1.0.0
**Status:** Approved
**Author:** Planner Agent
**Created:** 2026-06-16
**Updated:** 2026-06-16

---

## Overview

Scaffold a new SvelteKit (Svelte 5) project at `/home/momo/work/sveltes` using Bun as the package manager and runtime, with TypeScript as the language. This produces a clean, minimal starting point the user can extend with Tailwind, a database, auth, etc. in follow-up PRDs.

## Problem Statement

The user wants a modern, fast, type-safe SvelteKit starter running on Bun. The current workspace is empty. We need to pick the right CLI, the right add-on defaults, and the right Bun/Vite boundary so the project is stable on day one and extensible later.

## Goals

- Project scaffolded with Svelte 5 + SvelteKit (latest stable) + TypeScript (strict)
- Bun drives `install`, `scripts`, and `run`; Vite remains the dev bundler (stability)
- Default add-ons are minimal but cover lint/format hygiene
- `bun run dev` and `bun run check` work out of the box with no manual fixes

## Non-Goals

- No Tailwind, Drizzle, Lucia, Playwright, or mdsvex installed in this PRD
- No deployment config (Vercel/Netlify/Node adapter) — add in a follow-up
- No custom routes, components, or business logic

---

## Feature Specification

### User Stories

- As a developer, I want a working SvelteKit + Bun + TypeScript starter, so that I can build features on day one.
- As a developer, I want linting and formatting pre-configured, so that code quality is enforced from the start.

### Acceptance Criteria

- [ ] `package.json` exists, declares `"type": "module"`, uses Svelte 5 + `@sveltejs/kit` latest
- [ ] `bun install` completes with no errors and produces a `bun.lock` (text format)
- [ ] `bun run dev` starts the SvelteKit dev server on port 5173 and serves a 200 on `/`
- [ ] `bun run check` runs `svelte-kit sync && svelte-check` and reports 0 errors / 0 warnings
- [ ] `tsconfig.json` extends `.svelte-kit/tsconfig.json` and enables `strict: true`
- [ ] `.gitignore` excludes `node_modules`, `.svelte-kit`, `build`, `.env*`, `bun.lockb` (legacy)
- [ ] ESLint and Prettier configs exist and pass on the scaffolded files

---

## Technical Design

### Architecture Overview

Use the official `sv` CLI (replaces `create-svelte`) to scaffold, then immediately run `bun install` to rewrite the lockfile into Bun's text format. Bun is the package manager and script runner; Vite (bundled with SvelteKit) remains the dev server. We do **not** use `--bun` on `run dev` — keep Vite's Node-compatible dev for stability.

### Codebase Context

- Workspace `/home/momo/work/sveltes` is empty except for a `.github/` folder (skills, not source).
- No existing PRDs in `docs/planning/`.
- No conflicts to resolve.

### Key Tooling Decisions

| Concern           | Decision                         | Reason                                                      |
| ----------------- | -------------------------------- | ----------------------------------------------------------- |
| Scaffolder        | `npx sv create` (interactive)    | Official CLI as of 2025–2026; `create-svelte` is deprecated |
| Package manager   | Bun (`bun install`, `bun run …`) | User requirement; faster installs                           |
| Runtime for `dev` | Vite (default)                   | Most stable; pure Bun runtime is opt-in and out of scope    |
| Lockfile          | `bun.lock` (text)                | Newer Bun; `bun.lockb` is legacy                            |
| Language          | TypeScript with `strict: true`   | User requirement                                            |

---

## Implementation Plan

### Phase 1: Scaffold

**Depends on:** Nothing
**Parallelizable:** No — sequential because each step depends on the previous

| Task | Agent             | Files / Commands                                                  | Description                                                                                                                                                            |
| ---- | ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Backend Developer | `npx sv create sveltes` (run in `/home/momo/work/sveltes` parent) | Scaffold SvelteKit; pick **Skeleton project**, **TypeScript syntax: yes**, **Add-ons: prettier, eslint** only. Reject vitest/tailwind/drizzle/lucia/mdsvex/playwright. |
| 1.2  | Backend Developer | `cd sveltes && bun install`                                       | Re-install deps via Bun; produces `bun.lock`. Removes any `package-lock.json` left by `sv`.                                                                            |
| 1.3  | Backend Developer | `bun run dev` (then Ctrl+C)                                       | Smoke-test dev server starts on `http://localhost:5173`.                                                                                                               |
| 1.4  | Backend Developer | `bun run check`                                                   | Run `svelte-kit sync && svelte-check`; confirm 0 errors / 0 warnings.                                                                                                  |
| 1.5  | Backend Developer | `cat .gitignore`                                                  | Verify exclusions: `node_modules`, `.svelte-kit`, `build`, `.env*`, `.DS_Store`.                                                                                       |

**Sub-Agent Guidance:**

- Run `sv create` with `--template minimal --types ts --no-add-ons` if non-interactive is preferred, then manually add eslint/prettier via `bun add -d`.
- If `sv` prompts are interactive and the agent is non-interactive, fall back to the flag form above.

### Phase 2: Hardening (light touch)

**Depends on:** Phase 1

| Task | Agent             | Files              | Description                                                                                        |
| ---- | ----------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| 2.1  | Backend Developer | `package.json`     | Add `"type": "module"` if missing; confirm `scripts.check = "svelte-kit sync && svelte-check"`.    |
| 2.2  | Backend Developer | `tsconfig.json`    | Confirm `extends: "./.svelte-kit/tsconfig.json"`, `compilerOptions.strict: true`, `checkJs: true`. |
| 2.3  | Backend Developer | `svelte.config.js` | Leave as scaffolded (Vite plugin). Do not switch to `@sveltejs/adapter-node` in this PRD.          |

### Phase 3: Verification

**Depends on:** Phase 2

| Task | Agent             | Description                                                                                                                                                                                                                                                                   |
| ---- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Debugger/Reviewer | Hit `http://localhost:5173/` and confirm 200 + Svelte welcome page renders.                                                                                                                                                                                                   |
| 3.2  | Debugger/Reviewer | Run `bun run build`; confirm build artifacts are produced at `.svelte-kit/output/client/` and `.svelte-kit/output/server/` (this is where `adapter-auto` writes when no platform is detected; switching to `adapter-node` etc. will redirect output to a `build/` directory). |
| 3.3  | Reviewer          | Confirm `bun.lock` is committed and `bun.lockb` is absent.                                                                                                                                                                                                                    |

---

## Risks & Mitigations

| Risk                                                | Impact | Likelihood | Mitigation                                                                                                                                                       |
| --------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sv create` is interactive in a non-TTY environment | Med    | High       | Use flag form: `npx sv create sveltes --template minimal --types ts --no-add-ons`, then `bun add -d prettier eslint prettier-plugin-svelte eslint-plugin-svelte` |
| `bun.lockb` left over from older Bun versions       | Low    | Low        | `.gitignore` excludes it; delete manually if present                                                                                                             |
| Vite + Bun edge cases on Linux                      | Low    | Low        | Default to Vite dev (Node-compatible); only switch with `bun --bun run dev` if the user requests pure Bun runtime                                                |
| Port 5173 already in use                            | Low    | Low        | Vite auto-bumps to 5174+; document the fallback in verification                                                                                                  |

## Rollback Strategy

Workspace is empty; rollback = `rm -rf /home/momo/work/sveltes/{sveltes,package.json,...}` (or just delete the created files). No shared state to unwind.

---

## Recommended Default Add-Ons (install in follow-up PRDs, NOT this one)

- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Testing:** Vitest + `@playwright/test`
- **Database:** Drizzle ORM + a driver (Postgres/SQLite)
- **Auth:** Lucia (or `@auth/sveltekit`)
- **Content:** mdsvex
- **Deploy:** `@sveltejs/adapter-node` or platform-specific adapter

---

## Version History

| Version | Date       | Summary               |
| ------- | ---------- | --------------------- |
| 1.0.0   | 2026-06-16 | Initial scaffold plan |
