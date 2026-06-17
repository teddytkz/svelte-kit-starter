import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
	// Load .env into process.env so it is visible to:
	//   - Vite's dev runtime (process.env is not auto-populated by Vite)
	//   - SvelteKit's postbuild `analyse` fork (a plain Node child process)
	// Variables already set in the shell (e.g. CI/production overrides) win.
	const env = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(env)) {
		if (process.env[key] === undefined) process.env[key] = value;
	}

	return {
		plugins: [
			tailwindcss(),
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
	};
});
