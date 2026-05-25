import { json, error } from '@sveltejs/kit';
import { getAnswer } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { q } = await request.json();
  if (!q) throw error(400, 'Missing query');

  try {
    const data = await getAnswer({ q });
    return json({
      answer: data.answer || '',
      sources: data.sources || [],
    });
  } catch (e: any) {
    console.error('Answer error:', e);
    throw error(500, e.message || 'Answer failed');
  }
};
