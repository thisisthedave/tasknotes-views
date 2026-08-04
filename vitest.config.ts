import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Maps Obsidian's runtime-only package to the minimal test implementation used by pure cycle utilities. */
export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(new URL('./tests/obsidian.mock.ts', import.meta.url)),
		},
	},
});
