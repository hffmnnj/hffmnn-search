// Simple in-memory cache + rate limiter for Nominatim requests
// Respects OSM usage policy: max 1 req/sec, cache aggressively

interface CacheEntry {
  data: any;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // 1.1s between requests

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function nominatimFetch(url: string): Promise<any> {
  const cacheKey = url;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const res = await fetch(url, {
    headers: { 'User-Agent': 'hffmnn-search/1.0' },
  });

  if (res.status === 429) {
    console.warn('Nominatim rate limited, backing off...');
    await sleep(5000);
    lastRequestTime = Date.now();
    return null;
  }

  if (!res.ok) {
    console.warn('Nominatim error:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function nominatimGeocode(query: string, country?: string): Promise<{ lat: number; lon: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('accept-language', 'en-US');
  if (country) url.searchParams.set('countrycodes', country);

  const data = await nominatimFetch(url.toString());
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}
