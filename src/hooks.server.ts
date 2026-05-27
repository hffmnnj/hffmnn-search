import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';

const SESSION_COOKIE = 'hffmnn_session';

const PUBLIC_PATHS = [
	'/auth',
	'/api/auth',
	'/_app',
	'/svelte',
	'/fonts',
	'/favicon',
	'/manifest',
	'/robots.txt',
];

function isPublicPath(path: string): boolean {
	return PUBLIC_PATHS.some(p => path.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');

	if (!isPublicPath(path)) {
		const sessionToken = event.cookies.get(SESSION_COOKIE);
		const { valid } = validateSession(sessionToken || '');

		if (!valid) {
			if (isApi) {
				return new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			const returnUrl = encodeURIComponent(path + event.url.search);
			return new Response(null, {
				status: 302,
				headers: { Location: `/auth/pair?return=${returnUrl}` }
			});
		}
	}

	const response = await resolve(event);
	return response;
};
