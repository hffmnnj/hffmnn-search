import { json, error } from '@sveltejs/kit';
import { newsSearch } from '$lib/server/brave';
import { logSearch } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  const count = url.searchParams.get('count') || '10';
  const offset = url.searchParams.get('offset') || '0';
  const freshness = url.searchParams.get('freshness') || '';

  // Brave API max offset is 9
  const braveOffset = Math.min(parseInt(offset), 9);

  try {
    const data = await newsSearch({ q, count, offset: String(braveOffset), freshness });
    const results = data.results || [];

    logSearch(q, results.length, 'news');

    return json({
      query: q,
      results,
      offset: parseInt(offset),
      count: parseInt(count),
    });
  } catch (e: any) {
    console.error('News search error:', e);
    throw error(500, e.message || 'News search failed');
  }
};
