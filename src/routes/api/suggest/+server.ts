import { json, error } from '@sveltejs/kit';
import { suggest } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query');

  try {
    const data = await suggest(q);
    return json(data);
  } catch (e: any) {
    throw error(500, e.message || 'Suggest failed');
  }
};
