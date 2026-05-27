import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { llmConfigured, llmChatCompletion, getDefaultModel } from '$lib/server/llm';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';

// ─── Tool Definitions ───────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web for current information, facts, news, or to verify claims. Use this when the user asks about recent events, factual questions, or anything that might have changed since your training data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A specific, concise search query (1-10 words)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_news',
      description:
        'Search the local news archive for relevant news stories. Use this when the user asks about news, current events, politics, world affairs, or anything time-sensitive that might be in the news library.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A specific news search query (1-10 words)',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ─── Brave Search Executor ───────────────────────────────────────────────────────
async function executeSearch(query: string): Promise<string> {
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '8');
    url.searchParams.set('text_decorations', '0');
    url.searchParams.set('extra_snippets', '1');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brave API ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = data.web?.results || [];

    if (results.length === 0) {
      return 'No results found for this query.';
    }

    return results
      .slice(0, 5)
      .map(
        (r: any, i: number) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description || ''}`
      )
      .join('\n\n');
  } catch (e: any) {
    console.error('Tool search error:', e);
    return `Search failed: ${e.message}`;
  }
}

// ─── News Search Executor ───────────────────────────────────────────────────────
async function executeNewsSearch(query: string): Promise<string> {
  try {
    const port = process.env.PORT || 6767;
    const res = await fetch(`http://localhost:${port}/api/news-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 8 }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`News search ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = data.results || [];

    if (results.length === 0) {
      return 'No relevant news stories found in the archive.';
    }

    return results
      .slice(0, 5)
      .map(
        (r: any, i: number) =>
          `[${i + 1}] ${r.title}\nCategory: ${r.category_name || 'General'}\n${r.short_summary || ''}`
      )
      .join('\n\n');
  } catch (e: any) {
    console.error('News search tool error:', e);
    return `News search failed: ${e.message}`;
  }
}

// ─── LLM Chat with Tool Loop ───────────────────────────────────────────────────
async function chatWithTools(
  messages: any[],
  model: string,
  maxToolRounds = 3
): Promise<{ content: string; toolCalls: { name: string; query: string }[] }> {
  const toolCalls: { name: string; query: string }[] = [];

  for (let round = 0; round <= maxToolRounds; round++) {
    const data = await llmChatCompletion({
      model,
      messages,
      tools: TOOLS,
      temperature: 0.7,
      max_tokens: 4096,
    });

    const msg = data.choices?.[0]?.message;

    // No tool calls — we have the final answer
    if (!msg?.tool_calls || msg.tool_calls.length === 0) {
      return { content: msg?.content || '', toolCalls };
    }

    // Execute tool calls
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name;
      const args = JSON.parse(tc.function?.arguments || '{}');

      if (name === 'search_web' && args.query) {
        toolCalls.push({ name, query: args.query });
        const result = await executeSearch(args.query);

        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [tc],
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      if (name === 'search_news' && args.query) {
        toolCalls.push({ name, query: args.query });
        const result = await executeNewsSearch(args.query);

        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [tc],
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
    }
  }

  // Fallback if we hit max rounds
  return { content: 'I searched for information but could not form a complete answer.', toolCalls };
}

// ─── POST Handler ───────────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request }) => {
  const { messages, model, stream = false, search = false } = await request.json();
  if (!messages || !Array.isArray(messages)) throw error(400, 'Missing messages');
  if (!model) throw error(400, 'Missing model');

  try {
    // Build conversation with system prompt
    const systemPrompt =
      'You are a helpful AI assistant. When you need current information, facts, or to verify something, use the search_web tool. Always cite your sources using [1], [2], etc. when using search results.';

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // If forced search, inject a synthetic tool result for the last user message
    if (search && messages.length > 0) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        const result = await executeSearch(lastUser.content);
        fullMessages.push({
          role: 'user',
          content: `Please answer based on these search results:\n\n${result}\n\nMy question: ${lastUser.content}`,
        });
      }
    }

    const { content, toolCalls } = await chatWithTools(fullMessages, model);

    return json({
      response: content,
      model,
      toolCalls,
      searched: toolCalls.length > 0 || search,
    });
  } catch (e: any) {
    console.error('AI chat error:', e);
    throw error(500, e.message || 'AI chat failed');
  }
};
