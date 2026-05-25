import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

export const POST: RequestHandler = async ({ request }) => {
  const { message, context, history = [] } = await request.json();
  if (!message) throw error(400, 'Missing message');

  let results = context?.results || [];
  let query = context?.query || message;

  // If no context, do a quick web search for grounding
  if (results.length === 0) {
    try {
      const braveKey = process.env.BRAVE_API_KEY || '';
      const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
      searchUrl.searchParams.set('q', message);
      searchUrl.searchParams.set('count', '5');
      searchUrl.searchParams.set('text_decorations', '0');

      const res = await fetch(searchUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': braveKey,
        },
      });

      if (res.ok) {
        const data = await res.json();
        results = data.web?.results || [];
        query = message;
      }
    } catch (e) {
      console.error('Grounding search failed:', e);
    }
  }

  // Build prompt with grounding
  const formattedResults = results
    .slice(0, 5)
    .map((r: { title?: string; url?: string; description?: string }, i: number) =>
      `[${i + 1}] ${r.title || ''}
URL: ${r.url || ''}
${r.description || ''}`
    )
    .join('\n\n');

  const systemPrompt = `You are a helpful research assistant. The user searched for "${query}" and found these results:\n\n${formattedResults}\n\nAnswer the user's question using the search results as grounding. If the results don't contain the answer, say so honestly. Always cite your sources using [1], [2], etc.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h: { role: string; content: string }) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  // Ollama Cloud — note: use ollama.com not api.ollama.com
  try {
    const response = await fetch('https://ollama.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gemma4:31b-cloud',
        messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API ${response.status}: ${text}`);
    }

    const data = await response.json();
    return json({
      response: data.choices?.[0]?.message?.content || '',
      model: 'gemma4:31b-cloud',
    });
  } catch (e: any) {
    console.error('Chat error:', e);
    throw error(500, e.message || 'AI chat failed');
  }
};
