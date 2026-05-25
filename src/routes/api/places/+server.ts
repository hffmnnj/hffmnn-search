import { json, error } from '@sveltejs/kit';
import { placeSearch } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  const location = url.searchParams.get('location') || '';
  const lat = url.searchParams.get('lat') || '';
  const lng = url.searchParams.get('lng') || '';
  const count = url.searchParams.get('count') || '20';

  try {
    const data = await placeSearch({
      q: q || '',
      location,
      latitude: lat,
      longitude: lng,
      count,
    });
    return json({
      query: q,
      results: data.results || [],
      cities: data.cities || [],
      total: (data.results || []).length,
    });
  } catch (e: any) {
    console.error('Place search error:', e);
    throw error(500, e.message || 'Place search failed');
  }
};
