import { json, error } from '@sveltejs/kit';
import { llmContext } from '$lib/server/brave';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  const count = url.searchParams.get('count') || '20';
  const freshness = url.searchParams.get('freshness') || '';
  const max_tokens = url.searchParams.get('max_tokens') || '8192';
  const max_urls = url.searchParams.get('max_urls') || '20';

  try {
    const data = await llmContext({ q, count, freshness, max_tokens, max_urls });
    return json({
      query: q,
      snippets: data.snippets || [],
      sources: data.sources || {},
    });
  } catch (e: any) {
    console.error('LLM Context error:', e);
    throw error(500, e.message || 'LLM Context failed');
  }
};
