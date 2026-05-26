import { json, error } from '@sveltejs/kit';
import { getAllEmbeddings } from '$lib/server/db';
import { embedText, cosineSimilarity } from '$lib/server/embeddings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const query = body.query || '';
    const limit = Math.min(parseInt(body.limit || '10'), 50);

    if (!query) throw error(400, 'Missing query');

    // Vectorize the query
    const queryVector = await embedText(query);

    // Load all embeddings from DB
    const rows = getAllEmbeddings();
    const scored = [];

    for (const row of rows) {
      if (!row.embedding) continue;
      try {
        const vec = JSON.parse(row.embedding) as number[];
        if (vec.length !== queryVector.length) continue;
        const score = cosineSimilarity(queryVector, vec);
        scored.push({
          story_id: row.story_id,
          title: row.title,
          short_summary: row.short_summary,
          category_name: row.category_name,
          score,
        });
      } catch {
        // skip malformed embedding
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return json({ results: scored.slice(0, limit), query });
  } catch (e: any) {
    console.error('News search error:', e);
    throw error(500, e.message || 'News search failed');
  }
};
