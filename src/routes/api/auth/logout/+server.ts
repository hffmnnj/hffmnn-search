import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/auth';

const SESSION_COOKIE = 'hffmnn_session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		deleteSession(token);
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ success: true, message: 'Logged out' });
};
