# Setup: `@sveltejs/adapter-node`

**Status:** Active (this project)
**Last verified:** 2026-06-17 with `@sveltejs/kit` 2.63 + `@sveltejs/adapter-node` 5.5.4 + Bun 1.3 + Node 24

---

## Overview

`@sveltejs/adapter-node` turns `bun run build` (or `npm run build`) into a self-contained Node-compatible server. The output directory becomes a runnable artifact — you copy it to a host, run `node build` (or `bun build/index.js`), and you have a production SSR app on a port.

This project uses it as the default production target, replacing `@sveltejs/adapter-auto` (which only auto-detects a few platforms and falls back to a no-op build otherwise).

---

## When to use this adapter

| Use `adapter-node`                                      | Use something else                                         |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Self-hosted Node/Bun server (VPS, Docker, systemd, PM2) | Vercel / Netlify / Cloudflare (use the matching adapter)   |
| Long-lived process with a custom domain                 | Edge runtimes (use `adapter-cloudflare`, `adapter-vercel`) |
| Need full control of request lifecycle                  | Pure static site (use `adapter-static`)                    |
| Bun runtime with `--compile` single-binary deploy       |                                                            |

---

## Install

```bash
bun add -d @sveltejs/adapter-node
```

If you previously used `adapter-auto`, remove it (no longer needed):

```bash
bun remove @sveltejs/adapter-auto
```

---

## Configure `vite.config.ts`

```typescript
// filepath: vite.config.ts
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node runs the production server with Node/Bun.
			// See https://svelte.dev/docs/kit/adapters#node-adapter for configuration options.
			adapter: adapter({
				out: 'build'
			})
		})
	]
});
```

`out: 'build'` (alias `kit.outDir`) is the only required option. Other useful ones:

| Option        | Type      | Default   | Purpose                                                |
| ------------- | --------- | --------- | ------------------------------------------------------ |
| `out`         | `string`  | `'build'` | Output directory name                                  |
| `precompress` | `boolean` | `false`   | Emit `.gz` / `.br` for static assets                   |
| `envPrefix`   | `string`  | `''`      | Prefix for env vars forwarded to `$env/static/private` |

---

## Add a `start` script

```json
// filepath: package.json
{
	"scripts": {
		"dev": "vite dev",
		"build": "vite build",
		"preview": "vite preview",
		"start": "node build"
	}
}
```

`start` runs the compiled server. `preview` is Vite's local preview of `vite build` output — useful as a smoke test before `start`.

---

## Build & run

```bash
bun run build
# → ./build/{index.js, handler.js, env.js, shims.js, client/, server/}

bun run start
# → Listening on http://0.0.0.0:3000
```

### Verify it actually serves SSR

```bash
curl -sI http://localhost:3000/ | head -1
# HTTP/1.1 200 OK
```

The first request will be slower (cold start), subsequent ones are fast.

### Run with Bun instead of Node

```bash
bun ./build/index.js
```

Bun boots the same `build/index.js` 2-3× faster than Node in cold-start benchmarks. All `node:*` built-ins that adapter-node uses are available in Bun 1.2+.

---

## Running without Node.js

`adapter-node` is called "node adapter" because it ships a Node-compatible server bundle, but **the only thing it actually requires is a runtime that implements Node's built-in API**. Bun 1.x qualifies. Three run modes are available — none require Node.js:

| Mode              | Command                                                       | Needs at runtime             | Binary size             | Use when                                           |
| ----------------- | ------------------------------------------------------------- | ---------------------------- | ----------------------- | -------------------------------------------------- |
| **Bun runtime**   | `bun ./build/index.js`                                        | Bun                          | 0 (interprets `build/`) | Standard deploy, Bun is the only runtime you trust |
| **Single-binary** | `bun build --compile ./build/index.js --outfile sveltes-prod` | glibc only (no Bun, no Node) | ~91 MB ELF              | Ship one file to a host with no language runtime   |
| **Node runtime**  | `node build`                                                  | Node 18+                     | 0 (interprets `build/`) | Legacy hosts, Node-only infrastructure             |

The `compile` mode is exposed as the `compile` script:

```bash
bun run build
bun run compile
# → ./sveltes-prod (single binary, ~91 MB)

./sveltes-prod
# → Listening on http://0.0.0.0:3000
```

### What the single binary contains

`bun build --compile` embeds the Bun runtime + your SvelteKit SSR bundle into one ELF executable. The host system only needs a glibc-compatible Linux (or musl target with `--target=bun-linux-x64-musl`). No `node_modules`, no `package.json`, no runtime installer.

### Cross-compile from macOS to Linux

```bash
bun build --compile \
  --target=bun-linux-x64 \
  ./build/index.js \
  --outfile sveltes-prod
```

Supported targets: `bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`, `bun-windows-x64`.

### Default `start` script

This project uses Bun as the package manager and runtime, so `bun run start` invokes Bun:

```json
"start": "bun ./build/index.js",
"start:node": "node build"
```

If you need a fallback for hosts without Bun, use `bun run start:node`. If you want to make Node the default, swap the values.

---

## Output structure

```
build/
├── index.js       # entrypoint — `node build` runs this
├── handler.js     # standalone `RequestHandler` (for embedding in Express/Fastify/Polka)
├── env.js         # exposes $env/dynamic/private at runtime
├── shims.js       # Node ↔ platform compatibility shims
├── client/        # static assets — serve behind a reverse proxy
└── server/        # SSR code
```

`index.js` is a self-contained Node HTTP server. `handler.js` exports a `({ request, fetch, ... })` function you can mount in your own server framework.

---

## Environment variables

`adapter-node` reads these to control the running server:

| Var                       | Default   | Purpose                                                                                                                                 |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                    | `3000`    | TCP port to listen on                                                                                                                   |
| `HOST`                    | `0.0.0.0` | Bind address (use `127.0.0.1` behind a proxy)                                                                                           |
| `ORIGIN`                  | derived   | Public origin URL — **required** for correct absolute URLs, CSRF, and form actions. Set to e.g. `https://app.example.com` in production |
| `BODY_SIZE_LIMIT`         | `512kb`   | Max request body size                                                                                                                   |
| `PROTOCOL_HEADER`         | unset     | Header name for the original protocol (e.g. `X-Forwarded-Proto`)                                                                        |
| `HOST_HEADER`             | unset     | Header name for the original host                                                                                                       |
| `PORT_HEADER`             | unset     | Header name for the original port                                                                                                       |
| `ENABLE_BUNDLE_INSPECTOR` | unset     | Set to `1` to enable the bundle inspector at `/__inspect`                                                                               |
| `REQUEST_SIZE_LIMIT`      | `500000`  | Max multipart upload size (bytes)                                                                                                       |

```bash
PORT=8080 \
ORIGIN=https://app.example.com \
HOST=127.0.0.1 \
PROTOCOL_HEADER=X-Forwarded-Proto \
HOST_HEADER=X-Forwarded-Host \
node build
```

---

## Deployment patterns

### Bun single-binary (no runtime on target)

Compile the built server into a self-contained binary that runs without Bun installed:

```bash
bun build --compile ./build/index.js --outfile myapp
./myapp
```

`myapp` is ~80 MB and contains the Bun runtime + your SSR code. Ship it via `scp`, `curl | sh`, or a container registry.

### Node + systemd

```ini
# filepath: /etc/systemd/system/sveltes.service
[Unit]
Description=sveltes
After=network.target

[Service]
Type=simple
User=sveltes
WorkingDirectory=/opt/sveltes
Environment=PORT=3000
Environment=ORIGIN=https://app.example.com
ExecStart=/usr/bin/node /opt/sveltes/build
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sveltes
```

### Docker

```dockerfile
# filepath: Dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
ENV PORT=3000 ORIGIN=http://localhost:3000
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["bun", "./build/index.js"]
```

The runtime image only needs Bun — the build stage is discarded. No `node_modules` in the final image because `adapter-node` bundles everything into `build/`.

### Behind a reverse proxy (nginx, Caddy)

Serve `build/client/` directly from nginx for static assets, proxy everything else to Node:

```nginx
# filepath: /etc/nginx/sites-enabled/sveltes
server {
    listen 443 ssl http2;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ^~ /_app/ {
        root /opt/sveltes/build/client;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Then tell the Node app to trust the proxy:

```bash
PROTOCOL_HEADER=X-Forwarded-Proto \
HOST_HEADER=X-Forwarded-Host \
node build
```

---

## Health checks

`adapter-node` does not ship a `/health` endpoint. Add one in `src/routes/health/+server.ts`:

```typescript
// filepath: src/routes/health/+server.ts
import { json } from '@sveltejs/kit';

export const GET = () => json({ status: 'ok', uptime: process.uptime() }, { status: 200 });
```

Use it for Kubernetes liveness probes, load balancer health checks, or uptime monitors.

---

## Common customizations

### Pre-compress static assets

```typescript
adapter: adapter({ out: 'build', precompress: true });
```

Emits `.gz` and `.br` alongside every file in `build/client/`. Configure your reverse proxy to serve these (nginx: `gzip_static on;`).

### Run on a Unix socket (no port, no TCP overhead)

`adapter-node` does not support Unix sockets directly. Use a tiny `socat` / `nginx` shim, or wrap `build/handler.js` in a custom server:

```typescript
// filepath: src/server.ts
import http from 'node:http';
import { handler } from '../build/handler.js';

http.createServer(handler).listen(3000);
```

### Disable SSR for specific routes

Use `+page.ts` instead of `+page.server.ts` — adapter-node respects the per-route `prerender` / `ssr` exports:

```typescript
// filepath: src/routes/+page.ts
export const ssr = false; // SPA mode for this subtree
export const prerender = true; // also pre-render to static HTML
```

---

## Troubleshooting

### `Could not detect a supported production environment`

You're still on `adapter-auto`. Confirm `vite.config.ts` imports `@sveltejs/adapter-node`, not `@sveltejs/adapter-auto`. Run `bun run build` and look for the `Using @sveltejs/adapter-node` log line.

### `EADDRINUSE` on startup

Another process holds the port. Pick a different one (`PORT=8080 node build`) or kill the conflicting process.

### `ORIGIN` not set warning

`adapter-node` warns at boot if `ORIGIN` is unset and you're not on `localhost`. Set it to your public URL — wrong `ORIGIN` breaks CSRF protection, form actions, and `url.origin` in load functions.

### `Cannot find module './env.js'`

You moved or deleted the `build/` directory. The compiled server is meant to be relocated **as a whole** — don't pick individual files out of it.

### Static assets return 404

`build/client/` is the asset root. If you serve `build/` as the document root, `/_app/...` paths resolve. If you serve the app at a subpath, set `kit.paths.base` and rebuild.

---

## Related

- [SvelteKit adapter-node reference](https://svelte.dev/docs/kit/adapter-node)
- [SvelteKit adapter-auto reference](https://svelte.dev/docs/kit/adapter-auto)
- [`docs/planning/PRD-sveltekit-bun-setup.md`](../planning/PRD-sveltekit-bun-setup.md) — Bun + TypeScript setup context
