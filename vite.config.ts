import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 6767,
		host: '0.0.0.0',
		allowedHosts: ['laptop', 'localhost', '127.0.0.1', 'search.hffmnn.com', '.hffmnn.com']
	},
	preview: {
		port: 6767,
		host: '0.0.0.0',
		allowedHosts: ['laptop', 'localhost', '127.0.0.1', 'search.hffmnn.com', '.hffmnn.com']
	}
});
