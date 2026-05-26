import { json, error } from '@sveltejs/kit';
import { geocodeSearch, geocodePoint, photonSearchBiased } from '$lib/server/geocode';
import type { RequestHandler } from './$types';

function parseHours(openingHours: string | undefined): { isOpen: boolean | null; hoursText: string } {
  if (!openingHours) return { isOpen: null, hoursText: '' };

  const dailyMatch = openingHours.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  if (dailyMatch) {
    const [, sh, sm, eh, em] = dailyMatch.map(Number);
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end < start) end += 24 * 60;
    const isOpen = current >= start && current <= end;
    const format = (h: number, m: number) => `${h % 24 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    return { isOpen, hoursText: `${format(sh, sm)} \u2013 ${format(eh, em)}` };
  }

  if (/24\/7|00:00-24:00/.test(openingHours)) {
    return { isOpen: true, hoursText: 'Open 24 hours' };
  }

  return { isOpen: null, hoursText: openingHours };
}

function placeMatchesLocation(place: any, location: string): boolean {
  if (!location) return true;
  const locLower = location.toLowerCase();
  const fullText = `${place.name || ''} ${place.address || ''}`.toLowerCase();

  const isFullAddress = /\d/.test(location) || location.includes(',');
  if (isFullAddress) {
    const locWords = location
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((w) => w.length > 3 && !/^\d+$/.test(w) && !/^(street|st|avenue|ave|road|rd|drive|dr|way|blvd|boulevard|parkway|pkwy|highway|hwy|n|s|e|w|north|south|east|west)$/.test(w));
    return locWords.some((word) => fullText.includes(word));
  }

  return fullText.includes(locLower);
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  if (!q) throw error(400, 'Missing query parameter');

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 10);
  const country = url.searchParams.get('country') || '';
  const businessName = url.searchParams.get('business') || '';
  const location = url.searchParams.get('location') || '';

  try {
    let places: any[] = [];

    // Fast path: business + location parsed by intent classifier
    if (businessName && location) {
      const locPoint = await geocodePoint(location, country);
      if (locPoint) {
        // Search business biased toward that location using Photon
        const nearResults = await photonSearchBiased(businessName, locPoint.lat, locPoint.lon, limit);
        const filtered = nearResults.filter((p) => placeMatchesLocation(p, location));
        if (filtered.length > 0) {
          places = filtered.map(formatPlace);
          return json({ places, query: q });
        }
      }
    }

    // Direct query
    const direct = await geocodeSearch(q, country, limit);
    places = direct.map(formatPlace);

    // Split-query fallback: try business + location extraction
    if (places.length === 0) {
      const parts = q.trim().split(/\s+/);
      if (parts.length >= 2) {
        for (let split = parts.length - 1; split >= 1; split--) {
          const business = parts.slice(0, split).join(' ');
          const loc = parts.slice(split).join(' ');
          const locPoint = await geocodePoint(loc, country);
          if (locPoint) {
            const splitResults = await photonSearchBiased(business, locPoint.lat, locPoint.lon, limit);
            const filtered = splitResults.filter((p) => placeMatchesLocation(p, loc));
            if (filtered.length > 0) {
              places = filtered.map(formatPlace);
              break;
            }
          }
        }
      }
    }

    if (location) {
      places = places.filter((p) => placeMatchesLocation(p, location));
    }

    return json({ places, query: q });
  } catch (e: any) {
    console.error('Places-rich error:', e);
    throw error(500, e.message || 'Places search failed');
  }
};

function formatPlace(p: any): any {
  // Photon doesn't give us extratags/hours, but we can show what we have
  return {
    name: p.name || 'Unknown',
    address: p.address || '',
    lat: p.lat,
    lon: p.lon,
    phone: p.phone || '',
    website: p.website || '',
    cuisine: '',
    driveThrough: false,
    takeaway: false,
    delivery: false,
    wifi: false,
    isOpen: null,
    hoursText: '',
    rawHours: '',
    type: p.type || 'place',
    osmUrl: '',
  };
}
