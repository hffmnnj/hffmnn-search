import { json } from '@sveltejs/kit';
import { getSearchHistory, logSearch } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const history = getSearchHistory(limit);
  return json({ history });
};

export const POST: RequestHandler = async ({ request }) => {
  const { query } = await request.json();
  logSearch(query, 0, 'web');
  return json({ success: true });
};
