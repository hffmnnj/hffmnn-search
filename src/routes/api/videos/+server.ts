import { json, error } from '@sveltejs/kit';
import { videoSearch } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  const count = url.searchParams.get('count') || '20';
  const offset = url.searchParams.get('offset') || '0';
  const freshness = url.searchParams.get('freshness') || '';
  const safesearch = url.searchParams.get('safesearch') || 'moderate';

  try {
    const data = await videoSearch({ q, count, offset, freshness, safesearch });
    return json({
      query: q,
      results: data.results || [],
      total: data.total || 0,
    });
  } catch (e: any) {
    console.error('Video search error:', e);
    throw error(500, e.message || 'Video search failed');
  }
};
