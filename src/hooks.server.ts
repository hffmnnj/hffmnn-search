import type { Handle } from '@sveltejs/kit';
import { validateSession, isTrustedIp, createSession } from '$lib/server/auth';

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

function getClientIp(event: any): string | null {
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		const ips = forwarded.split(',').map((ip: string) => ip.trim());
		for (const ip of ips) {
			if (ip && ip !== '127.0.0.1' && ip !== '::1') {
				return ip;
			}
		}
	}
	try {
		const direct = event.getClientAddress();
		if (direct && direct !== '127.0.0.1' && direct !== '::1') {
			return direct;
		}
	} catch {
		// ignore
	}
	return null;
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');

	if (!isPublicPath(path)) {
		const sessionToken = event.cookies.get(SESSION_COOKIE);
		let { valid } = validateSession(sessionToken || '');

		// Auto-authenticate Tailnet / LAN devices
		if (!valid) {
			const clientIp = getClientIp(event);
			if (clientIp && isTrustedIp(clientIp)) {
				const userAgent = event.request.headers.get('user-agent') || 'tailnet';
				const newToken = createSession(clientIp, userAgent);
				event.cookies.set(SESSION_COOKIE, newToken, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 90
				});
				valid = true;
			}
		}

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
