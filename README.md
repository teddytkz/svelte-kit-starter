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

## Database (Drizzle ORM + MySQL)

Drizzle ORM is wired up with `mysql2` for type-safe queries. The client and connection config all live in a single file: [`src/lib/server/db/index.ts`](src/lib/server/db/index.ts ).

### Setup

1. Create a MySQL database.
2. Copy [`.env.example`](.env.example ) to `.env` and set the connection vars:

````bash
cp .env.example .env
# then edit .env
DB_URL="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASS="password"
DB_NAME="sveltes"
````

3. Apply the schema to your MySQL database with the client of your choice. The canonical DDL is in [`db/migration/001_init.sql`](db/migration/001_init.sql ); seed data (optional, idempotent) is in [`db/seed/seed.sql`](db/seed/seed.sql ).

### Layout

| Path                                | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `src/lib/server/db/index.ts`        | Drizzle client + env config (server-only)              |
| `src/lib/server/db/schema.ts`       | Barrel — re-exports all table definitions              |
| `src/lib/server/db/schema/user.ts`  | `users` table definition (mirrors `001_init.sql`)      |
| `db/migration/001_init.sql`         | Canonical DDL (reference)                              |
| `db/seed/seed.sql`                  | Canonical seed data (reference)                        |

> **Add a new table** —
> 1. write the DDL in a new file `db/migration/00X_xxx.sql`,
> 2. add the matching table definition to `src/lib/server/db/schema/<name>.ts`,
> 3. re-export it from `src/lib/server/db/schema.ts`,
> 4. apply the DDL manually with your MySQL client.

## Notes

- The lockfile is **`bun.lock`** (text/JSON format). The legacy binary `bun.lockb` is git-ignored.
- `svelte-kit sync` is run automatically by `prepare`, `check`, and `build`.
- Bun auto-loads `.env`, so `process.env.DB_*` works directly in server code — no `dotenv` needed.
