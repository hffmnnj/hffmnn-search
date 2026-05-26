// Bang shortcuts — inspired by Kagi/DuckDuckGo
// Usage: "!w quantum physics" → redirect to Wikipedia

export interface Bang {
  trigger: string;      // e.g. "w"
  name: string;
  url: string;          // template with {{{s}}} placeholder
  internal?: boolean;   // if true, switches tab instead of redirecting
  tab?: 'web' | 'images' | 'videos' | 'news';
}

export const BANGS: Bang[] = [
  // Internal — switch tabs
  { trigger: 'i', name: 'Images', url: '', internal: true, tab: 'images' },
  { trigger: 'n', name: 'News', url: '', internal: true, tab: 'news' },
  { trigger: 'v', name: 'Videos', url: '', internal: true, tab: 'videos' },
  { trigger: 'web', name: 'Web', url: '', internal: true, tab: 'web' },

  // External — redirect
  { trigger: 'w', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search={{{s}}}' },
  { trigger: 'wiki', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search={{{s}}}' },
  { trigger: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={{{s}}}' },
  { trigger: 'gh', name: 'GitHub', url: 'https://github.com/search?q={{{s}}}&type=repositories' },
  { trigger: 'g', name: 'Google', url: 'https://www.google.com/search?q={{{s}}}' },
  { trigger: 'r', name: 'Reddit', url: 'https://www.reddit.com/search/?q={{{s}}}' },
  { trigger: 'so', name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q={{{s}}}' },
  { trigger: 'a', name: 'Amazon', url: 'https://www.amazon.com/s?k={{{s}}}' },
  { trigger: 'am', name: 'Amazon', url: 'https://www.amazon.com/s?k={{{s}}}' },
  { trigger: 'maps', name: 'Google Maps', url: 'https://google.com/maps?q={{{s}}}' },
  { trigger: 'tw', name: 'Twitter', url: 'https://x.com/search?q={{{s}}}' },
  { trigger: 'x', name: 'X', url: 'https://x.com/search?q={{{s}}}' },
  { trigger: 'sp', name: 'StartPage', url: 'https://www.startpage.com/do/search?query={{{s}}}' },
  { trigger: 'hn', name: 'Hacker News', url: 'https://hn.algolia.com/?q={{{s}}}' },
  { trigger: 'imdb', name: 'IMDb', url: 'https://www.imdb.com/find?q={{{s}}}' },
  { trigger: 'wa', name: 'WolframAlpha', url: 'https://www.wolframalpha.com/input/?i={{{s}}}' },
  { trigger: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={{{s}}}' },
  { trigger: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={{{s}}}' },
  { trigger: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q={{{s}}}' },
  { trigger: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/en-US/search?q={{{s}}}' },
  { trigger: 'arch', name: 'Arch Wiki', url: 'https://wiki.archlinux.org/title/Special:Search?search={{{s}}}' },
  { trigger: 'aur', name: 'AUR', url: 'https://aur.archlinux.org/packages?K={{{s}}}' },
  { trigger: 'p', name: 'Phoenix AZ Places', url: '' }, // Placeholder for Phoenix-specific
  { trigger: 'lucky', name: 'I\'m Feeling Lucky', url: '' }, // Special — handled separately
];

const BANG_MAP = new Map<string, Bang>();
for (const b of BANGS) {
  BANG_MAP.set(b.trigger, b);
}

export function parseBang(query: string): { bang: Bang | null; rest: string } {
  const trimmed = query.trim();
  // Match !bang or !bang at start
  const match = trimmed.match(/^!(\w+)(?:\s+(.+))?$/);
  if (!match) return { bang: null, rest: trimmed };

  const trigger = match[1].toLowerCase();
  const rest = match[2] || '';
  const bang = BANG_MAP.get(trigger) || null;
  return { bang, rest };
}

export function buildBangUrl(bang: Bang, query: string): string {
  return bang.url.replace(/\{\{\{s\}\}\}/g, encodeURIComponent(query));
}
