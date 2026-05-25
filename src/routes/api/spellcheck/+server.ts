import { json, error } from '@sveltejs/kit';
import { webSearch } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query');

  try {
    const data = await webSearch({ q, count: '1' });
    const altered = data.query?.altered;
    return json({
      original: q,
      suggestions: altered && altered !== q ? [altered] : [],
    });
  } catch (e: any) {
    console.error('Spellcheck error:', e);
    throw error(500, e.message || 'Spellcheck failed');
  }
};
