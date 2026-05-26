import { json, error } from '@sveltejs/kit';
import { geocodePoint } from '$lib/server/geocode';
import type { RequestHandler } from './$types';

const US_ADDRESS_REGEX = /(\d+\s+(?:N\s+|S\s+|E\s+|W\s+|North\s+|South\s+|East\s+|West\s+)?[A-Za-z0-9\s]{3,30}(?:Parkway|Pkwy|Highway|Hwy|Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Way|Lane|Ln|Circle|Cir|Loop|Trail|Terrace|Place|Pl|Court|Ct)\b(?:\s*,\s*[A-Za-z\s]+){0,2}(?:\s+(?:Arizona|AZ|Alabama|AL|Alaska|AK|Arkansas|AR|California|CA|Colorado|CO|Connecticut|CT|Delaware|DE|Florida|FL|Georgia|GA|Hawaii|HI|Idaho|ID|Illinois|IL|Indiana|IN|Iowa|IA|Kansas|KS|Kentucky|KY|Louisiana|LA|Maine|ME|Maryland|MD|Massachusetts|MA|Michigan|MI|Minnesota|MN|Mississippi|MS|Missouri|MO|Montana|MT|Nebraska|NE|Nevada|NV|New Hampshire|NH|New Jersey|NJ|New Mexico|NM|New York|NY|North Carolina|NC|North Dakota|ND|Ohio|OH|Oklahoma|OK|Oregon|OR|Pennsylvania|PA|Rhode Island|RI|South Carolina|SC|South Dakota|SD|Tennessee|TN|Texas|TX|Utah|UT|Vermont|VT|Virginia|VA|Washington|WA|West Virginia|WV|Wisconsin|WI|Wyoming|WY))?\b(?:\s+\d{5}(?:-\d{4})?)?)/gi;

const PHONE_REGEX = /\(\d{3}\)\s*\d{3}-\d{4}/g;
const CLOSED_SIGNALS = /\b(closed|shut down|permanently closed|out of business|no longer open|defunct|discontinued)\b/i;

function extractAddresses(text: string): string[] {
  const matches: string[] = [];
  let m;
  US_ADDRESS_REGEX.lastIndex = 0;
  while ((m = US_ADDRESS_REGEX.exec(text)) !== null) {
    matches.push(m[0].trim());
  }
  return matches;
}

function extractPhone(text: string): string {
  const m = text.match(PHONE_REGEX);
  return m ? m[0] : '';
}

function extractHours(text: string): string {
  if (/open\s+24\s*hours?|24\s*hours?|24\/7|00:00-24:00/i.test(text)) {
    return 'Open 24 hours';
  }
  const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm))/i);
  if (timeMatch) return timeMatch[0];
  return '';
}

function isClosedSignal(text: string): boolean {
  return CLOSED_SIGNALS.test(text);
}

function streetKey(addr: string): string {
  if (!addr) return '';
  const firstPart = addr.split(',')[0].trim().toLowerCase();
  return firstPart.replace(/\s+(for|open|hours|menu|breakfast|burgers|delivery).*$/, '').trim();
}

async function extractPlacesFromWebResults(results: any[], businessName: string): Promise<any[]> {
  const seenAddresses = new Set<string>();
  const places: any[] = [];

  for (const r of results.slice(0, 6)) {
    const text = `${r.title || ''} ${r.description || ''}`;
    const addresses = extractAddresses(text);
    const phone = extractPhone(text);
    const hoursText = extractHours(text);
    const closed = isClosedSignal(text);

    for (const addr of addresses) {
      const normalized = addr
        .replace(/\s+\d{5}(?:-\d{4})?$/g, '')
        .replace(/,\s*Arizona\b/gi, ', AZ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (seenAddresses.has(normalized)) continue;
      seenAddresses.add(normalized);

      // Skip if the source snippet explicitly says closed
      if (closed) {
        console.log('Skipping closed location:', addr, 'from', r.url);
        continue;
      }

      // Skip if same street address already exists (dedupe by street number + name)
      const sk = streetKey(addr);
      const dupByAddr = places.find((o) => streetKey(o.address || o.name || '') === sk && sk.length > 0);
      if (dupByAddr) continue;

      const coords = await geocodePoint(addr, 'US');
      places.push({
        name: businessName.split(/\s+/).slice(0, 3).join(' '),
        address: addr,
        lat: coords ? coords.lat : 0,
        lon: coords ? coords.lon : 0,
        phone,
        website: r.url || '',
        cuisine: '',
        driveThrough: false,
        takeaway: false,
        delivery: false,
        wifi: false,
        isOpen: hoursText.includes('24') ? true : null,
        hoursText,
        rawHours: '',
        type: 'extracted',
        osmUrl: '',
      });
    }
  }

  return places;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const q = body.q || '';
    const webResults = body.web || [];

    if (!q) throw error(400, 'Missing query');

    // Step 1: Get search intent (business + location split)
    let intent: any = null;
    try {
      const intentRes = await fetch(`http://localhost:${process.env.PORT || 6767}/api/search-intent?q=${encodeURIComponent(q)}`);
      if (intentRes.ok) {
        intent = await intentRes.json();
      }
    } catch (e) {
      console.error('Intent error:', e);
    }

    const businessName = intent?.businessName || q;

    // Step 2: Extract places from web results (skip places-rich — unreliable for business names)
    let places: any[] = [];
    if (webResults.length > 0) {
      places = await extractPlacesFromWebResults(webResults, businessName);
    }

    // Step 3: Gemma4 validation — filter out closed/invalid locations
    if (places.length > 0 && webResults.length > 0) {
      const snippets = webResults.slice(0, 5).map((r: any) => `${r.title}\n${r.description || ''}`).join('\n---\n');
      const placeList = places.map((p, i) => `${i}: ${p.name} at ${p.address}`).join('\n');

      try {
        const validateRes = await fetch(`http://localhost:${process.env.PORT || 6767}/api/ai-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `You are a business location validator. Check which of these locations are REAL and CURRENTLY OPEN. Be strict — if a location is closed, shut down, moved, or a duplicate, remove it.\n\nLocations:\n${placeList}\n\nSearch snippets:\n${snippets}\n\nReturn ONLY a JSON array of index numbers for VALID locations. Example: [0, 2]. If none are valid, return []. Do not explain.`
              }
            ],
            model: 'gemma4:31b-cloud',
          }),
        });

        if (validateRes.ok) {
          const vdata = await validateRes.json();
          const raw = vdata.response || '';
          const match = raw.match(/\[([\d,\s]*)\]/);
          if (match) {
            const validIndices = match[0]
              .replace(/[\[\]]/g, '')
              .split(',')
              .map((s: string) => parseInt(s.trim()))
              .filter((n: number) => !isNaN(n) && n >= 0 && n < places.length);
            places = validIndices.map((i: number) => places[i]);
          }
        }
      } catch (e) {
        console.error('Validation error:', e);
      }
    }

    return json({ places, query: q });
  } catch (e: any) {
    console.error('Search-places error:', e);
    throw error(500, e.message || 'Places search failed');
  }
};
