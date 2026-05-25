import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 6767,
		host: '0.0.0.0'
	},
	preview: {
		port: 6767,
		host: '0.0.0.0'
	}
});
