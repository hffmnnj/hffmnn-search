import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generatePairingCode } from '$lib/server/auth';

export const POST: RequestHandler = async () => {
	try {
		const code = generatePairingCode();
		return json({ code, expiresIn: 300 });
	} catch (e: any) {
		console.error('Auth code generation error:', e);
		throw error(500, e.message || 'Failed to generate pairing code');
	}
};
