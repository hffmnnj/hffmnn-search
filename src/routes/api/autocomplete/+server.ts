import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DDG_AC = 'https://duckduckgo.com/ac/';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q || q.length < 2) return json({ suggestions: [] });

  try {
    // Fetch from DuckDuckGo autocomplete (public, no key needed)
    const res = await fetch(`${DDG_AC}?q=${encodeURIComponent(q)}&type=list`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
    });

    let suggestions: string[] = [];
    if (res.ok) {
      const data = await res.json();
      // DDG returns array of arrays: [[phrase, type], ...] or just [phrase]
      suggestions = data
        .map((item: any) => (Array.isArray(item) ? item[0] : item))
        .filter((s: string) => s && s.length > 0 && s.toLowerCase() !== q.toLowerCase())
        .slice(0, 8);
    }

    return json({ suggestions, query: q });
  } catch (e: any) {
    console.error('Autocomplete error:', e);
    return json({ suggestions: [], query: q });
  }
};
