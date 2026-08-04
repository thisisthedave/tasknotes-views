import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'copy-files.mjs',
		'version-bump.mjs',
		'scripts/prepare-release-notes.mjs',
		'scripts/update-release-index.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['src/settings.ts'],
		rules: {
			// This fallback is required by Obsidian runtimes that still invoke display() despite exposing definitions.
			'obsidianmd/settings-tab/no-deprecated-display': 'off',
		},
	},
	{
		files: ['tests/obsidian.mock.ts'],
		rules: {
			// The runtime-only Obsidian package needs Moment supplied by the test harness.
			'@typescript-eslint/no-restricted-imports': 'off',
			'import/no-extraneous-dependencies': 'off',
		},
	},
	{
		files: ['vitest.config.ts'],
		rules: {
			// Vitest configuration executes under Node and is excluded from the mobile plugin bundle.
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
