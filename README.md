# sveltes

A minimal **SvelteKit + Bun + TypeScript** starter. Svelte 5, Vite, ESLint, and Prettier are preconfigured.

## Prerequisites

- [Bun](https://bun.sh) **>= 1.1** (this project was scaffolded with Bun 1.3.14)

## Getting started

```bash
bun install
```

## Scripts

| Command               | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `bun run dev`         | Start the dev server at <http://localhost:5173>           |
| `bun run build`       | Produce a production build in `.svelte-kit/output`        |
| `bun run preview`     | Preview the production build locally                      |
| `bun run check`       | Run `svelte-kit sync && svelte-check` (0 errors expected) |
| `bun run check:watch` | Run `svelte-check` in watch mode                          |
| `bun run lint`        | Run Prettier check + ESLint                               |
| `bun run format`      | Format the whole repo with Prettier                       |

## Project layout

```
src/
  app.d.ts
  app.html
  lib/
    assets/favicon.svg
    index.ts
  routes/
    +layout.svelte
    +page.svelte
static/
  robots.txt
```

## Notes

- The lockfile is **`bun.lock`** (text/JSON format). The legacy binary `bun.lockb` is git-ignored.
- `svelte-kit sync` is run automatically by `prepare`, `check`, and `build`.
- Add-ons (Tailwind, Drizzle, Lucia, mdsvex, Vitest, Playwright, etc.) are intentionally **not** included — install them in follow-up PRDs as needed.
