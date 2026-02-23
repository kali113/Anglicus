import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	// Load env vars from repository root so web/api can share one .env value.
	envDir: '..',
	// Allow GOOGLE_CLIENT_ID without requiring a duplicated VITE_ alias.
	envPrefix: ['VITE_', 'GOOGLE_']
});
