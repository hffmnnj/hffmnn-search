import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePairingCode, createSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const body = await request.json();
		const code = body.code?.toUpperCase().trim();
		if (!code || code.length !== 6) {
			throw error(400, 'Invalid pairing code format');
		}
		const ip = getClientAddress();
		const userAgent = request.headers.get('user-agent') || 'unknown';
		const { valid, error: validationError } = validatePairingCode(code, ip, userAgent);
		if (!valid) {
			throw error(401, validationError || 'Invalid pairing code');
		}
		createSession(ip, userAgent, code);
		return json({ success: true, message: 'Device paired successfully' });
	} catch (e: any) {
		console.error('Auth pair error:', e);
		if (e.status) throw e;
		throw error(500, e.message || 'Failed to pair device');
	}
};
