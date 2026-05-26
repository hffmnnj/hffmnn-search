// Multi-provider geocoding client: Photon (primary) + Nominatim (fallback)
// Photon: https://photon.komoot.io — free, OSM-based, better business coverage
// Nominatim: https://nominatim.openstreetmap.org — official, rate-limited

interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: string;
  phone?: string;
  website?: string;
  hours?: string;
}

const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Photon ───────────────────────────────────────────────────────────────

export async function photonSearch(query: string, limit = 5): Promise<PlaceResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));

  try {
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      console.warn('Photon error:', res.status);
      return [];
    }
    const json = await res.json();
    const features = json.features || [];
    return features.map((f: any) => {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [0, 0];
      const parts = [
        p.housenumber,
        p.street,
        p.city,
        p.state,
        p.postcode,
        p.country,
      ].filter(Boolean);
      return {
        name: p.name || query,
        address: parts.join(', ') || query,
        lat: coords[1],
        lon: coords[0],
        type: p.osm_value || 'place',
      };
    });
  } catch (err) {
    console.warn('Photon failed:', err);
    return [];
  }
}

export async function photonSearchBiased(query: string, lat: number, lon: number, limit = 5): Promise<PlaceResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));

  try {
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      console.warn('Photon error:', res.status);
      return [];
    }
    const json = await res.json();
    const features = json.features || [];
    return features.map((f: any) => {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [0, 0];
      const parts = [
        p.housenumber,
        p.street,
        p.city,
        p.state,
        p.postcode,
        p.country,
      ].filter(Boolean);
      return {
        name: p.name || query,
        address: parts.join(', ') || query,
        lat: coords[1],
        lon: coords[0],
        type: p.osm_value || 'place',
      };
    });
  } catch (err) {
    console.warn('Photon biased failed:', err);
    return [];
  }
}

// ─── Nominatim (with simple cache + rate limit) ───────────────────────────

interface CacheEntry {
  data: any;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nominatimFetch(url: string): Promise<any> {
  const cacheKey = url;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastRequestTime = Date.now();

  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'hffmnn-search/1.0' },
    });

    if (res.status === 429) {
      console.warn('Nominatim rate limited');
      return null;
    }
    if (!res.ok) {
      console.warn('Nominatim error:', res.status);
      return null;
    }

    const data = await res.json();
    cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.warn('Nominatim fetch failed:', err);
    return null;
  }
}

export async function nominatimSearch(query: string, country?: string, limit = 5): Promise<PlaceResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'en-US');
  if (country) url.searchParams.set('countrycodes', country);

  const data = await nominatimFetch(url.toString());
  if (!data || !Array.isArray(data)) return [];

  return data.map((item: any) => ({
    name: item.display_name?.split(',')[0] || query,
    address: item.display_name || query,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    type: item.type || 'place',
  }));
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

// ─── Unified interface ──────────────────────────────────────────────────

export async function geocodeSearch(query: string, country?: string, limit = 5): Promise<PlaceResult[]> {
  // Try Photon first — usually faster, better business coverage, no rate limits
  const photon = await photonSearch(query, limit);
  if (photon.length > 0) return photon;

  // Fallback to Nominatim
  return nominatimSearch(query, country, limit);
}

export async function geocodePoint(query: string, country?: string): Promise<{ lat: number; lon: number } | null> {
  // Try Photon first
  const photon = await photonSearch(query, 1);
  if (photon.length > 0) {
    return { lat: photon[0].lat, lon: photon[0].lon };
  }
  return nominatimGeocode(query, country);
}
