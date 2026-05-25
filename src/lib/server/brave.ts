const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const BASE_URL = 'https://api.search.brave.com/res/v1';

async function braveFetch(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave API ${res.status}: ${text}`);
  }

  return res.json();
}

async function bravePost(endpoint: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Web Search ─────────────────────────────────────────────────────────────
export async function webSearch(params: {
  q: string;
  count?: string;
  offset?: string;
  freshness?: string;
  safesearch?: string;
  country?: string;
  lang?: string;
  goggles?: string;
}) {
  return braveFetch('/web/search', {
    q: params.q,
    count: params.count || '10',
    offset: params.offset || '0',
    freshness: params.freshness || '',
    safesearch: params.safesearch || 'moderate',
    country: params.country || '',
    search_lang: params.lang || '',
    text_decorations: '0',
    extra_snippets: '1',
    goggles: params.goggles || '',
  });
}

// ─── News Search ────────────────────────────────────────────────────────────
export async function newsSearch(params: {
  q: string;
  count?: string;
  offset?: string;
  freshness?: string;
  country?: string;
  lang?: string;
}) {
  return braveFetch('/news/search', {
    q: params.q,
    count: params.count || '10',
    offset: params.offset || '0',
    freshness: params.freshness || '',
    country: params.country || '',
    search_lang: params.lang || '',
    text_decorations: '0',
    extra_snippets: '1',
  });
}

// ─── Image Search ───────────────────────────────────────────────────────────
export async function imageSearch(params: {
  q: string;
  count?: string;
  offset?: string;
  safesearch?: string;
  country?: string;
  lang?: string;
}) {
  // Image search only accepts 'off' or 'strict' for safesearch
  const safe = params.safesearch === 'off' ? 'off' : 'strict';
  return braveFetch('/images/search', {
    q: params.q,
    count: params.count || '20',
    offset: params.offset || '0',
    safesearch: safe,
    country: params.country || '',
    search_lang: params.lang || '',
  });
}

// ─── Video Search ───────────────────────────────────────────────────────────
export async function videoSearch(params: {
  q: string;
  count?: string;
  offset?: string;
  freshness?: string;
  safesearch?: string;
  country?: string;
  lang?: string;
}) {
  return braveFetch('/videos/search', {
    q: params.q,
    count: params.count || '20',
    offset: params.offset || '0',
    freshness: params.freshness || '',
    safesearch: params.safesearch || 'moderate',
    country: params.country || '',
    search_lang: params.lang || '',
  });
}

// ─── Place Search ───────────────────────────────────────────────────────────
export async function placeSearch(params: {
  q?: string;
  latitude?: string;
  longitude?: string;
  location?: string;
  count?: string;
  country?: string;
}) {
  return braveFetch('/places/search', {
    q: params.q || '',
    latitude: params.latitude || '',
    longitude: params.longitude || '',
    location: params.location || '',
    count: params.count || '20',
    country: params.country || '',
  });
}

// ─── LLM Context ────────────────────────────────────────────────────────────
export async function llmContext(params: {
  q: string;
  count?: string;
  offset?: string;
  freshness?: string;
  country?: string;
  lang?: string;
  max_tokens?: string;
  max_urls?: string;
  context_threshold_mode?: string;
}) {
  return braveFetch('/llm/context', {
    q: params.q,
    count: params.count || '20',
    offset: params.offset || '0',
    freshness: params.freshness || '',
    country: params.country || '',
    search_lang: params.lang || '',
    max_tokens: params.max_tokens || '8192',
    max_urls: params.max_urls || '20',
    context_threshold_mode: params.context_threshold_mode || 'balanced',
  });
}

// ─── Answers ──────────────────────────────────────────────────────────────────
export async function getAnswer(params: {
  q: string;
  country?: string;
  lang?: string;
}) {
  return bravePost('/answer', {
    q: params.q,
    country: params.country || '',
    search_lang: params.lang || '',
  });
}

// ─── Autosuggest ────────────────────────────────────────────────────────────
export async function suggest(query: string) {
  return braveFetch('/suggest', { q: query });
}

// ─── Spellcheck ─────────────────────────────────────────────────────────────
export async function spellcheck(query: string) {
  return braveFetch('/spellcheck', { q: query });
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  meta?: {
    url?: string;
  };
  profile?: {
    name: string;
    url: string;
    long_name: string;
    img: string;
  };
  language?: string;
  family_friendly?: boolean;
  type?: string;
}

export interface BraveNewsResult {
  title: string;
  url: string;
  description: string;
  age: string;
  meta?: {
    url?: string;
  };
}

export interface BraveImageResult {
  title: string;
  url: string;
  source: string;
  thumbnail: {
    src: string;
    original: string;
  };
  properties: {
    url: string;
    placeholder: string;
  };
}

export interface BraveVideoResult {
  title: string;
  url: string;
  description: string;
  age: string;
  thumbnail: {
    src: string;
  };
  meta: {
    url: string;
    domain: string;
    page_age?: string;
    duration?: string;
  };
}
