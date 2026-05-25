import { json, error } from '@sveltejs/kit';
import { imageSearch } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  const count = url.searchParams.get('count') || '20';
  const offset = url.searchParams.get('offset') || '0';
  const safesearch = url.searchParams.get('safesearch') || 'moderate';

  try {
    const data = await imageSearch({ q, count, offset, safesearch });
    return json({
      query: q,
      results: data.results || [],
      total: data.total || 0,
    });
  } catch (e: any) {
    console.error('Image search error:', e);
    throw error(500, e.message || 'Image search failed');
  }
};
