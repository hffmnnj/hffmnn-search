import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { q } = await request.json();
  if (!q) return json({ answer: '', sources: [], error: 'Missing query' }, { status: 400 });

  // Brave Answers API returns 403 on free plan — graceful fallback
  return json({
    answer: '',
    sources: [],
    error: 'Quick Answer requires a Brave Search Pro plan. Upgrade at api-dashboard.search.brave.com',
  });
};
