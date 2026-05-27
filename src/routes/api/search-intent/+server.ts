import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { llmConfigured, llmChatCompletion, getDefaultModel } from '$lib/server/llm';

interface SearchIntent {
  intent: 'places' | 'web' | 'definition' | 'knowledge';
  businessName?: string;
  location?: string;
  confidence: number;
}

const INTENT_PROMPT = `You are a search query classifier. Analyze the query and return ONLY a JSON object.

Rules:
- "places" = looking for a business, restaurant, store, or place at a location (e.g., "McDonald's Maricopa", "pizza near me", "Starbucks Phoenix")
- "definition" = asking what a word means (e.g., "define serendipity", "what is photosynthesis")
- "web" = general web search (e.g., "SpaceX launch", "2024 election results")
- "knowledge" = factual question about a person/thing/concept (e.g., "who is Napoleon", "capital of France")

For "places" intent, extract:
- businessName: the business or place name (e.g., "McDonald's", "pizza", "Starbucks")
- location: the city, neighborhood, or "near me" (e.g., "Maricopa", "Phoenix", "near me")

Return ONLY valid JSON. No markdown, no explanation.

Examples:
{"intent":"places","businessName":"McDonald's","location":"Maricopa","confidence":0.95}
{"intent":"places","businessName":"pizza","location":"near me","confidence":0.88}
{"intent":"definition","confidence":0.98}
{"intent":"web","confidence":0.85}
{"intent":"knowledge","confidence":0.90}

Query: "{QUERY}"`;

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  if (!llmConfigured()) {
    return json(heuristicIntent(q));
  }

  try {
    const prompt = INTENT_PROMPT.replace('{QUERY}', q.replace(/"/g, '\\"'));

    const data = await llmChatCompletion({
      model: getDefaultModel('gemma4:31b-cloud'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 256,
    });

    const content = data.choices?.[0]?.message?.content || '';

    let intent: SearchIntent;
    try {
      // Extract JSON from possible markdown fences
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      intent = JSON.parse(jsonStr);
      if (!intent.intent || !['places', 'web', 'definition', 'knowledge'].includes(intent.intent)) {
        intent = heuristicIntent(q);
      }
    } catch {
      intent = heuristicIntent(q);
    }

    return json(intent);
  } catch (e) {
    console.error('Search intent error:', e);
    return json(heuristicIntent(q));
  }
};

function heuristicIntent(q: string): SearchIntent {
  const qLower = q.toLowerCase();
  const placeSignals = ['near me', 'nearby', 'closest', 'nearest', 'location', 'hours', 'address', 'phone'];
  const isPlace = placeSignals.some((s) => qLower.includes(s)) ||
    (q.split(' ').length <= 4 && !q.match(/\b(what|how|why|when|who|define|meaning|is|are)\b/i));

  if (q.match(/^(?:define|what is|meaning of|definition of)\s+/i)) {
    return { intent: 'definition', confidence: 0.7 };
  }
  if (isPlace) {
    const parts = q.trim().split(/\s+/);
    if (parts.length >= 2 && parts.length <= 4) {
      const business = parts.slice(0, -1).join(' ');
      const location = parts[parts.length - 1];
      return { intent: 'places', businessName: business, location, confidence: 0.6 };
    }
    return { intent: 'places', confidence: 0.5 };
  }
  if (q.match(/\b(what|who|when|where|how|why|is|are|was|were|did|does|can|could|would|should|will|has|have)\b/i)) {
    return { intent: 'knowledge', confidence: 0.6 };
  }
  return { intent: 'web', confidence: 0.5 };
}
