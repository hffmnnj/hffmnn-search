import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isCodeUsed, createSession } from '$lib/server/auth';

const SESSION_COOKIE = 'hffmnn_session';

export const GET: RequestHandler = async ({ url, getClientAddress, cookies, request }) => {
	const code = url.searchParams.get('code')?.toUpperCase().trim();
	if (!code) {
		return json({ paired: false, error: 'No code provided' });
	}
	const used = isCodeUsed(code);
	if (used) {
		const ip = getClientAddress();
		const userAgent = request.headers.get('user-agent') || 'unknown';
		const token = createSession(ip, userAgent, code);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 90
		});
		return json({ paired: true });
	}
	return json({ paired: false });
};
