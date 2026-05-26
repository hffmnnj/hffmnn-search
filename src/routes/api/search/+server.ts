import { json, error } from '@sveltejs/kit';
import { webSearch } from '$lib/server/brave';
import { logSearch, getDomainPrefs } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  const count = url.searchParams.get('count') || '10';
  const offset = url.searchParams.get('offset') || '0';
  const freshness = url.searchParams.get('freshness') || '';
  const safesearch = url.searchParams.get('safesearch') || 'moderate';
  const country = url.searchParams.get('country') || '';
  const lang = url.searchParams.get('lang') || '';

  // Brave API max offset is 9 — cap it
  const braveOffset = Math.min(parseInt(offset), 9);

  try {
    const data = await webSearch({ q, count, offset: String(braveOffset), freshness, safesearch, country, lang });
    const webResults = data.web?.results || [];
    const newsResults = data.news?.results || [];
    const videoResults = data.videos?.results || [];
    const summaryKey = data.query?.summary_key || '';

    // Get domain preferences
    const domainPrefs = getDomainPrefs();

    // Filter blocked domains from web results
    let filtered = webResults.filter((r: any) => {
      const domain = extractDomain(r.meta?.url || r.url || '');
      return domainPrefs[domain] !== 'block';
    });

    // Reorder: pinned domains first
    filtered.sort((a: any, b: any) => {
      const da = extractDomain(a.meta?.url || a.url || '');
      const db = extractDomain(b.meta?.url || b.url || '');
      const pa = domainPrefs[da] === 'pin' ? 1 : 0;
      const pb = domainPrefs[db] === 'pin' ? 1 : 0;
      return pb - pa;
    });

    // Build mixed feed from Brave's mixed array
    const feed: any[] = [];
    const mixed = data.mixed?.main || [];

    for (const item of mixed) {
      if (item.type === 'web' && item.index !== undefined) {
        const result = filtered[item.index];
        if (result) {
          feed.push({ type: 'web', data: result });
        }
      } else if (item.type === 'news' && item.all) {
        for (const nr of newsResults) {
          feed.push({ type: 'news', data: nr });
        }
      } else if (item.type === 'videos' && item.all) {
        for (const vr of videoResults.slice(0, 3)) {
          feed.push({ type: 'video', data: vr });
        }
      } else if (item.type === 'images' && item.all) {
        // Skip inline images for now
      }
    }

    // Fallback: if no mixed data, just use filtered web results
    if (feed.length === 0) {
      for (const r of filtered) {
        feed.push({ type: 'web', data: r });
      }
    }

    // ─── Infobox Detection (fast paths only) ─────────────────────────────────
    let infobox = null;
    let infoboxType: string | null = null;
    const qLower = q.toLowerCase();

    // Definition query — use best web result description
    const defMatch = q.match(/^(?:define|what is|meaning of|definition of)\s+(.+)/i);
    if (defMatch && filtered.length > 0) {
      const term = defMatch[1].trim();
      const dictResult = filtered.find((r: any) => {
        const domain = extractDomain(r.url || '');
        return /merriam|dictionary|oxford|cambridge|vocabulary|thefreedictionary|collins/.test(domain);
      }) || filtered[0];
      infobox = {
        type: 'definition',
        term,
        content: dictResult.description || '',
        source: dictResult.url || '',
      };
    }

    // Places query — don't block, mark as pending
    const placeSignals = ['near me', 'nearby', 'closest', 'nearest', 'location', 'hours', 'address', 'phone'];
    const isPlaceQuery =
      placeSignals.some((s) => qLower.includes(s)) ||
      (q.split(' ').length <= 3 && !q.match(/\b(what|how|why|when|who|define|meaning|is|are)\b/i));
    if (isPlaceQuery && !infobox) {
      infoboxType = 'places';
    }

    // Knowledge card — use top result for any query that doesn't have an infobox yet
    if (!infobox && filtered.length > 0 && !isPlaceQuery) {
      infobox = {
        type: 'knowledge',
        title: q,
        content: filtered[0].description || '',
        source: filtered[0].url || '',
      };
    }

    // Log search
    logSearch(q, filtered.length, 'web');

    return json({
      query: q,
      altered: data.query?.altered || '',
      web: filtered,
      news: newsResults,
      videos: videoResults.slice(0, 6),
      feed,
      infobox,
      infoboxType,
      total: data.web?.total?.results || 0,
      offset: parseInt(offset),
      count: parseInt(count),
      summaryKey,
      relatedQueries: data.query?.related || [],
    });
  } catch (e: any) {
    console.error('Search error:', e);
    throw error(500, e.message || 'Search failed');
  }
};

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
