<script lang="ts">
  import 'leaflet/dist/leaflet.css';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { mdToHtml } from '$lib/md';
  import { parseBang, buildBangUrl } from '$lib/bangs';

  let query = $state($page.url.searchParams.get('q') || '');
  let feed = $state<any[]>([]);
  let isLoading = $state(false);
  let activeTab = $state<'web' | 'images' | 'videos' | 'news'>('web');
  let freshness = $state('');
  let offset = $state(0);
  let total = $state(0);
  let error = $state('');
  let spellSuggestion = $state('');
  let aiOverview = $state('');
  let isOverviewLoading = $state(false);
  let webResults = $state<any[]>([]);
  let newsResults = $state<any[]>([]);
  let videoResults = $state<any[]>([]);
  let hasMore = $state(false);
  let currentPage = $state(1);

  let infobox = $state<any>(null);
  let placesInfobox = $state<any[]>([]);
  let isPlacesLoading = $state(false);
  let mapContainer = $state<HTMLDivElement | null>(null);
  let mapInstance: any = null;

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: 'web', label: 'Web' },
    { id: 'images', label: 'Images' },
    { id: 'videos', label: 'Videos' },
    { id: 'news', label: 'News' },
  ];

  function decodeHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function extractDomain(url: string): string {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function formatAge(age: string | undefined): string {
    if (!age) return '';
    const d = new Date(age);
    if (isNaN(d.getTime())) return age;
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
    return `${Math.floor(diff / 31536000)}y ago`;
  }

  // Group web results by domain for tree view
  function groupByDomain(results: any[]) {
    const groups: Record<string, { domain: string; favicon: string; results: any[] }> = {};
    for (const r of results) {
      const domain = extractDomain(r.meta?.url || r.url || '');
      if (!groups[domain]) {
        groups[domain] = { domain, favicon: r.profile?.img || '', results: [] };
      }
      groups[domain].results.push(r);
    }
    return groups;
  }

  async function search(append = false) {
    if (!query.trim()) return;
    isLoading = true;
    error = '';
    if (!append) {
      spellSuggestion = '';
      aiOverview = '';
      if (offset === 0) {
        webResults = [];
        newsResults = [];
        videoResults = [];
        feed = [];
        infobox = null;
        placesInfobox = [];
        relatedQueries = [];
        currentPage = 1;
      }
    }

    // Build effective query with site filter
    let effectiveQuery = query.trim();
    if (siteFilter.trim() && activeTab === 'web') {
      effectiveQuery += ` site:${siteFilter.trim()}`;
    }

    // Brave API offset is a PAGE INDEX (0-9), not a result count
    const params = new URLSearchParams({ q: effectiveQuery, count: String(resultCount) });
    if (freshness && activeTab !== 'images') params.set('freshness', freshness);
    if (activeTab === 'videos' && freshness) params.set('freshness', freshness);
    params.set('offset', String(offset));

    try {
      let endpoint = '/api/search';
      if (activeTab === 'news') endpoint = '/api/news';
      else if (activeTab === 'images') endpoint = '/api/images';
      else if (activeTab === 'videos') endpoint = '/api/videos';

      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();

      if (activeTab === 'web') {
        const newWeb = data.web || [];
        const newNews = data.news || [];
        const newVideos = data.videos || [];
        const newFeed = data.feed || [];

        if (!append) {
          webResults = newWeb;
          newsResults = newNews;
          videoResults = newVideos;
          feed = newFeed;
          infobox = data.infobox || null;
          relatedQueries = data.relatedQueries || [];
          placesInfobox = []; // reset; will load async
          if (data.altered && data.altered !== query.trim()) {
            spellSuggestion = data.altered;
          }
          loadOverview(query, newWeb.slice(0, 5));
          // Async load places if this is a place query
          if (data.infoboxType === 'places') {
            loadPlaces(query, newWeb, data.infoboxType);
          }
        } else {
          // Append new results, dedupe by URL
          const seen = new Set(webResults.map(r => r.url));
          const newWebFiltered = newWeb.filter((r: any) => !seen.has(r.url));
          webResults = [...webResults, ...newWebFiltered];
          const newsSeen = new Set(newsResults.map(r => r.url));
          newsResults = [...newsResults, ...newNews.filter((r: any) => !newsSeen.has(r.url))];
          const vidSeen = new Set(videoResults.map(r => r.url));
          videoResults = [...videoResults, ...newVideos.filter((r: any) => !vidSeen.has(r.url))];
          const feedSeen = new Set(feed.map(f => f.data?.url));
          feed = [...feed, ...newFeed.filter((r: any) => !feedSeen.has(r.data?.url))];
          // Only advance page if we actually got new results
          if (newWebFiltered.length > 0) currentPage += 1;
        }
        total = data.total || 0;
        hasMore = offset < 9 && newWeb.length > 0;
      } else {
        const newResults = (data.results || []).map((r: any) => ({
          type: activeTab === 'news' ? 'news' : activeTab === 'videos' ? 'video' : 'image',
          data: r
        }));
        if (!append) {
          feed = newResults;
        } else {
          const seen = new Set(feed.map(f => f.data?.url));
          const newFiltered = newResults.filter((r: any) => !seen.has(r.data?.url));
          feed = [...feed, ...newFiltered];
          if (newFiltered.length > 0) currentPage += 1;
        }
        total = data.total || 0;
        hasMore = offset < 9 && newResults.length > 0;
      }
    } catch (e: any) {
      error = e.message || 'Search failed';
    } finally {
      isLoading = false;
      if (!append && browser && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  function loadMore() {
    offset += 1;
    search(true);
  }

  function goToPage(pageNum: number) {
    // Brave API max offset is 9 (page 10)
    const targetPage = Math.min(Math.max(pageNum, 1), 10);
    offset = targetPage - 1;
    webResults = [];
    newsResults = [];
    videoResults = [];
    feed = [];
    infobox = null;
    placesInfobox = [];
    aiOverview = '';
    spellSuggestion = '';
    currentPage = targetPage;
    search(false);
  }

  function getPageNumbers(): number[] {
    // Brave API supports offset 0-9 (10 pages max)
    const maxPages = 10;
    const pages: number[] = [];
    for (let i = 1; i <= maxPages; i++) pages.push(i);
    return pages;
  }
  async function loadPlaces(q: string, webResultsForContext: any[], infoboxType: string | null) {
    if (infoboxType !== 'places') return;
    isPlacesLoading = true;
    try {
      const res = await fetch('/api/search-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, web: webResultsForContext.slice(0, 6) }),
      });
      if (res.ok) {
        const data = await res.json();
        placesInfobox = data.places || [];
      }
    } catch (e) {
      console.error('Places load failed:', e);
    } finally {
      isPlacesLoading = false;
    }
  }

  async function loadOverview(q: string, results: any[]) {
    isOverviewLoading = true;
    try {
      const contextText = results.slice(0, 5).map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.description || ''}`).join('\n\n');
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `Give me a concise 2-3 sentence overview of "${q}" based on these search results. Be factual and cite sources using [1], [2], etc.\n\n${contextText}` }
          ],
          model: 'gemma4:31b-cloud',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        aiOverview = data.response || '';
      }
    } catch (e) {
      console.error('Overview failed:', e);
    } finally {
      isOverviewLoading = false;
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const { bang, rest } = parseBang(trimmed);
    if (bang) {
      if (bang.internal && bang.tab) {
        switchTab(bang.tab);
        query = rest || trimmed;
        offset = 0;
        search();
        return;
      }
      if (bang.url) {
        const url = buildBangUrl(bang, rest || trimmed);
        window.open(url, '_blank');
        return;
      }
    }

    offset = 0;
    search();
  }

  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
    offset = 0;
    feed = [];
    webResults = [];
    newsResults = [];
    videoResults = [];
    aiOverview = '';
    spellSuggestion = '';
    error = '';
    currentPage = 1;
    infobox = null;
    placesInfobox = [];
    isPlacesLoading = false;
    search();
  }

  import { onMount } from 'svelte';

  let searchInput = $state<HTMLInputElement | null>(null);
  let showShortcuts = $state(false);
  let showImageLightbox = $state<any>(null);
  let siteFilter = $state('');
  let resultCount = $state(20);
  let searchSuggestions = $state<string[]>([]);
  let showSearchSuggestions = $state(false);
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;

  async function fetchSearchSuggestions() {
    const trimmed = query.trim();
    if (trimmed.length < 2) { searchSuggestions = []; return; }
    try {
      const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        searchSuggestions = data.suggestions || [];
      }
    } catch (e) { searchSuggestions = []; }
  }

  function onSearchInput() {
    showSearchSuggestions = true;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(fetchSearchSuggestions, 150);
  }

  function selectSearchSuggestion(s: string) {
    query = s;
    searchSuggestions = [];
    showSearchSuggestions = false;
    offset = 0;
    search();
  }

  function onSearchBlur() {
    setTimeout(() => { showSearchSuggestions = false; }, 200);
  }

  onMount(() => {
    if (browser && query) {
      // Check for bangs on initial load
      const { bang, rest } = parseBang(query);
      if (bang) {
        if (bang.internal && bang.tab) {
          activeTab = bang.tab;
          query = rest || query;
        } else if (bang.url) {
          const url = buildBangUrl(bang, rest || query);
          window.open(url, '_blank');
          return;
        }
      }
      search();
    }

    // Keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      // Ignore if inside input/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (e.key === 'Escape') {
          (target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInput?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        showShortcuts = true;
      } else if (e.key === 'Escape') {
        showShortcuts = false;
        showImageLightbox = null;
        directionsPlace = null;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Initialize Leaflet map when places infobox is shown
  $effect(() => {
    if (!browser || !mapContainer || placesInfobox.length === 0) {
      return;
    }
    // Destroy previous map
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    // Dynamic import leaflet
    import('leaflet').then((L) => {
      const places = dedupePlaces(placesInfobox).filter((p: any) => p.lat && p.lon);
      if (places.length === 0) return;

      const map = L.map(mapContainer, { attributionControl: false }).setView([places[0].lat, places[0].lon], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Force tile refresh after container settles
      requestAnimationFrame(() => {
        map.invalidateSize();
        setTimeout(() => map.invalidateSize(), 200);
        setTimeout(() => map.invalidateSize(), 600);
      });

      const bounds = L.latLngBounds([]);
      places.forEach((place: any, i: number) => {
        const label = String.fromCharCode(65 + i);
        const markerHtml = `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--accent,#c87a4f);color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${label}</div>`;
        const icon = L.divIcon({
          className: 'custom-map-marker',
          html: markerHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -28],
        });
        const marker = L.marker([place.lat, place.lon], { icon }).addTo(map);
        marker.bindPopup(`<b>${label}. ${place.name}</b><br>${place.address || ''}`);
        bounds.extend([place.lat, place.lon]);
      });

      if (places.length > 1) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }

      mapInstance = map;
    });
  });

  // Extract street address (number + street name) for deduping
  function streetKey(addr: string): string {
    if (!addr) return '';
    // Take everything before first comma, strip extra words
    const firstPart = addr.split(',')[0].trim().toLowerCase();
    // Remove common suffixes like "for breakfast, burgers"
    return firstPart.replace(/\s+(for|open|hours|menu|breakfast|burgers|delivery).*$/, '').trim();
  }

  // Deduplicate places by street address + coordinate proximity (~50m)
  function dedupePlaces(places: any[]): any[] {
    const out: any[] = [];
    for (const p of places) {
      const sk = streetKey(p.address || p.name || '');
      // Skip if same street address already exists
      const dupByAddr = out.find((o) => streetKey(o.address || o.name || '') === sk && sk.length > 0);
      if (dupByAddr) continue;
      // Skip if within ~50m (0.0005 deg ~ 55m)
      const dupByDist = out.find((o) =>
        o.lat && o.lon && p.lat && p.lon &&
        Math.abs(o.lat - p.lat) < 0.0005 && Math.abs(o.lon - p.lon) < 0.0005
      );
      if (dupByDist) continue;
      out.push(p);
    }
    return out;
  }

  let directionsPlace = $state<any>(null);
  let relatedQueries = $state<string[]>([]);
</script>

<svelte:head>
  <title>{query ? `${query} — hffmnn` : 'hffmnn'}</title>
</svelte:head>

<div class="py-6 sm:py-8 overflow-x-hidden">
  <div class="mx-auto max-w-5xl px-2 sm:px-0">
  <!-- Search bar -->
  <form onsubmit={handleSubmit} class="mb-5">
    <div class="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4 py-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-[var(--accent)] min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="text-[var(--text-tertiary)] shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        type="text"
        bind:this={searchInput}
        bind:value={query}
        oninput={onSearchInput}
        onblur={onSearchBlur}
        onkeydown={(e) => {
          if (e.key === 'Escape') { searchSuggestions = []; showSearchSuggestions = false; }
        }}
        placeholder="Search..."
        class="flex-1 min-w-0 bg-transparent font-body text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-tertiary)]"
      />
      {#if query}
        <button
          type="button"
          onclick={() => { query = ''; }}
          class="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Clear"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      {/if}
      <button type="submit" class="shrink-0 rounded-full bg-[var(--accent)] px-3 sm:px-4 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors">
        Search
      </button>
    </div>

    {#if showSearchSuggestions && searchSuggestions.length > 0}
      <div class="mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden">
        {#each searchSuggestions as s}
          <button
            type="button"
            onclick={() => selectSearchSuggestion(s)}
            class="w-full text-left px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="text-[var(--text-tertiary)] shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span class="truncate">{s}</span>
          </button>
        {/each}
      </div>
    {/if}
  </form>

  <!-- Spell suggestion -->
  {#if spellSuggestion && spellSuggestion !== query}
    <div class="mb-3 text-sm text-[var(--text-secondary)]">
      Did you mean <button class="font-medium text-[var(--accent)] hover:underline" onclick={() => { query = spellSuggestion; offset = 0; search(); }}>{spellSuggestion}</button>?
    </div>
  {/if}

  <!-- Tab bar -->
  <div class="mb-4 border-b border-[var(--border)]">
    <div class="flex flex-wrap items-center gap-0.5">
      {#each tabs as tab}
        <button
          onclick={() => switchTab(tab.id)}
          class="relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap {activeTab === tab.id ? 'text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'}"
        >
          {tab.label}
          {#if activeTab === tab.id}
            <span class="absolute bottom-0 left-1 right-1 h-[2px] bg-[var(--accent)] rounded-full"></span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="flex items-center gap-2 pb-2 pt-1 flex-wrap">
      {#if activeTab === 'web'}
        <input
          type="text"
          bind:value={siteFilter}
          onkeydown={(e) => { if (e.key === 'Enter') { offset = 0; search(); } }}
          placeholder="site:"
          class="w-24 sm:w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
        />
      {/if}
      <select
        bind:value={resultCount}
        onchange={() => { offset = 0; search(); }}
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-secondary)] outline-none hover:border-[var(--border-strong)]"
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
      </select>
      <select
        bind:value={freshness}
        onchange={() => { offset = 0; search(); }}
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-secondary)] outline-none hover:border-[var(--border-strong)]"
      >
        <option value="">Any time</option>
        <option value="pd">Past 24h</option>
        <option value="pw">Past week</option>
        <option value="pm">Past month</option>
        <option value="py">Past year</option>
      </select>
    </div>
  </div>

  <!-- Loading -->
  {#if isLoading && offset === 0 && webResults.length === 0 && feed.length === 0}
    <div class="py-12 text-center">
      <div class="mx-auto mb-3 h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"></div>
      <p class="font-body italic text-sm text-[var(--text-secondary)]">Searching...</p>
    </div>

  <!-- Error -->
  {:else if error}
    <div class="rounded-lg border border-[var(--error)] bg-red-50 dark:bg-red-950/20 p-4 text-[var(--error)]">
      <p class="text-sm font-medium">Something went wrong</p>
      <p class="mt-1 text-xs opacity-80">{error}</p>
    </div>

  <!-- Results -->
  {:else if (activeTab === 'web' && webResults.length > 0) || (activeTab !== 'web' && feed.length > 0)}
    <div class="space-y-2">
      <!-- AI Overview (web only, first page) -->
      {#if activeTab === 'web' && offset === 0}
        {#if isOverviewLoading}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--highlight)] p-4">
            <div class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"></div>
              <span class="font-medium">AI Overview</span>
              <span class="text-xs">Generating...</span>
            </div>
          </div>
        {:else if aiOverview}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--highlight)] p-4">
            <div class="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-[var(--accent)]"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              <span class="text-sm font-medium text-[var(--text)]">AI Overview</span>
            </div>
            <div class="text-sm leading-relaxed text-[var(--text)] prose prose-sm max-w-none">
              {@html mdToHtml(aiOverview)}
            </div>
          </div>
        {/if}
      {/if}

      <!-- Infobox -->
      {#if infobox}
        {#if infobox.type === 'definition'}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div class="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-[var(--accent)]"><path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"/></svg>
              <span class="text-sm font-medium text-[var(--text)]">Definition: {infobox.term}</span>
            </div>
            <p class="text-sm leading-relaxed text-[var(--text-secondary)]">{infobox.content}</p>
            {#if infobox.source}
              <a href={infobox.source} target="_blank" rel="noopener" class="mt-2 inline-block text-[10px] text-[var(--text-tertiary)] hover:text-[var(--accent)]">Source</a>
            {/if}
          </div>
        {:else if infobox.type === 'knowledge'}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div class="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-[var(--accent)]"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span class="text-sm font-medium text-[var(--text)]">{infobox.title}</span>
            </div>
            <p class="text-sm leading-relaxed text-[var(--text-secondary)]">{infobox.content}</p>
            {#if infobox.source}
              <a href={infobox.source} target="_blank" rel="noopener" class="mt-2 inline-block text-[10px] text-[var(--text-tertiary)] hover:text-[var(--accent)]">Source</a>
            {/if}
          </div>
        {/if}
      {/if}

      <!-- Places infobox (async loaded) -->
      {#if isPlacesLoading || placesInfobox.length > 0}
        {#if isPlacesLoading && placesInfobox.length === 0}
          <!-- Skeleton loader -->
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div class="h-48 w-full bg-[var(--surface-hover)] animate-pulse"></div>
            <div class="divide-y divide-[var(--border)]">
              {#each [1,2,3] as _}
                <div class="px-4 py-3">
                  <div class="flex items-start gap-3">
                    <div class="h-5 w-5 rounded-full bg-[var(--surface-hover)] animate-pulse shrink-0"></div>
                    <div class="flex-1 space-y-2">
                      <div class="h-3.5 w-24 bg-[var(--surface-hover)] animate-pulse rounded"></div>
                      <div class="h-3 w-40 bg-[var(--surface-hover)] animate-pulse rounded"></div>
                      <div class="h-3 w-32 bg-[var(--surface-hover)] animate-pulse rounded"></div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          {@const dplaces = dedupePlaces(placesInfobox)}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <!-- Map -->
            {#if dplaces.length > 0}
              <div bind:this={mapContainer} class="h-48 w-full bg-[var(--surface-hover)]"></div>
            {/if}

            <!-- Place cards -->
            <div class="divide-y divide-[var(--border)]">
              {#each dplaces as place, i}
                <div class="px-4 py-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">{String.fromCharCode(65 + i)}</span>
                        <h3 class="text-sm font-medium text-[var(--text)]">{place.name}</h3>
                      </div>

                      <!-- Open/Closed status -->
                      {#if place.isOpen !== null}
                        <p class="mt-1 text-xs">
                          {#if place.isOpen}
                            <span class="text-green-600 dark:text-green-400 font-medium">Open</span>
                          {:else}
                            <span class="text-[var(--error)] font-medium">Closed</span>
                          {/if}
                          {#if place.hoursText}
                            <span class="text-[var(--text-tertiary)]"> • {place.hoursText}</span>
                          {/if}
                        </p>
                      {:else if place.hoursText}
                        <p class="mt-1 text-xs text-[var(--text-tertiary)]">{place.hoursText}</p>
                      {/if}

                      <!-- Address -->
                      {#if place.address}
                        <p class="mt-1 text-xs text-[var(--text-secondary)]">{place.address}</p>
                      {/if}

                      <!-- Tags -->
                      <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                        {#if place.cuisine}
                          <span class="rounded bg-[var(--bg)] px-1.5 py-0.5">{place.cuisine}</span>
                        {/if}
                        {#if place.driveThrough}
                          <span class="rounded bg-[var(--bg)] px-1.5 py-0.5 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 17h14"/><path d="M5 12h14"/><path d="M5 7h14"/></svg>
                            Drive-thru
                          </span>
                        {/if}
                        {#if place.wifi}
                          <span class="rounded bg-[var(--bg)] px-1.5 py-0.5">WiFi</span>
                        {/if}
                      </div>

                      <!-- Action buttons -->
                      <div class="mt-2.5 flex items-center gap-2">
                        {#if place.phone}
                          <a href="tel:{place.phone}" class="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            Call
                          </a>
                        {/if}
                        {#if place.lat && place.lon}
                          <button onclick={() => directionsPlace = place} class="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h18"/><path d="M12 3v18"/><path d="m7 15 5-5 5 5"/><path d="m7 9 5 5 5-5"/></svg>
                            Directions
                          </button>
                        {/if}
                        {#if place.website}
                          <a href={place.website} target="_blank" rel="noopener" class="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            Website
                          </a>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <!-- OSM Attribution -->
            <div class="px-4 py-1.5 border-t border-[var(--border)] bg-[var(--surface-hover)]/30">
              <p class="text-[9px] text-[var(--text-tertiary)]">
                © <a href="https://www.openstreetmap.org/copyright" target="_blank" class="hover:text-[var(--accent)]">OpenStreetMap</a> contributors
              </p>
            </div>
          </div>
        {/if}
      {/if}

      {#if activeTab === 'web'}
        <!-- Tree-grouped web results -->
        {#each Object.entries(groupByDomain(webResults)) as [domain, group]}
          {#if group.results.length > 1}
            <!-- Domain tree card -->
            <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <!-- Domain header -->
            <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--surface-hover)]/50 min-w-0">
              {#if group.favicon}
                <img src={group.favicon} alt="" class="h-4 w-4 rounded-full shrink-0" loading="lazy" />
              {:else}
                <div class="h-4 w-4 rounded-full bg-[var(--border-strong)] shrink-0"></div>
              {/if}
              <span class="text-xs font-medium text-[var(--text-secondary)] truncate">{domain}</span>
              <span class="shrink-0 text-[10px] text-[var(--text-tertiary)] bg-[var(--border)] px-1.5 py-0.5 rounded-full">{group.results.length}</span>
            </div>
              <!-- Child results -->
              <div class="divide-y divide-[var(--border)]">
                {#each group.results as result}
                  <a href={result.url} target="_blank" rel="noopener" class="block px-3.5 py-2.5 hover:bg-[var(--surface-hover)] transition-colors">
                    <h3 class="font-heading text-sm leading-snug text-[var(--text)]">{decodeHtml(result.title)}</h3>
                    <p class="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{formatAge(result.page_age)}</p>
                    <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2">{decodeHtml(result.description)}</p>
                  </a>
                {/each}
              </div>
            </div>
          {:else}
            <!-- Single result — compact card -->
            {@const result = group.results[0]}
            <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:border-[var(--border-strong)] transition-colors">
              <a href={result.url} target="_blank" rel="noopener" class="block">
                <div class="flex items-start gap-2.5 min-w-0">
                  {#if result.profile?.img}
                    <img src={result.profile.img} alt="" class="mt-0.5 h-4 w-4 rounded-full shrink-0" loading="lazy" />
                  {/if}
                  <div class="min-w-0 flex-1">
                    <h3 class="font-heading text-sm leading-snug text-[var(--text)] break-words">{decodeHtml(result.title)}</h3>
                    <p class="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                      <span class="text-[var(--text-secondary)] truncate">{domain}</span>
                      {#if result.page_age}
                        <span>•</span>
                        <span>{formatAge(result.page_age)}</span>
                      {/if}
                    </p>
                    <p class="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2">{decodeHtml(result.description)}</p>
                  </div>
                </div>
              </a>
            </div>
          {/if}
        {/each}

        <!-- Inline mixed: news & videos -->
        {#if newsResults.length > 0}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div class="px-3.5 py-2 border-b border-[var(--border)] bg-[var(--surface-hover)]/50">
              <span class="text-xs font-medium text-[var(--text-secondary)]">News</span>
            </div>
            <div class="divide-y divide-[var(--border)]">
              {#each newsResults.slice(0, 4) as result}
                <a href={result.url} target="_blank" rel="noopener" class="block px-3.5 py-2.5 hover:bg-[var(--surface-hover)] transition-colors">
                  <h3 class="font-heading text-sm leading-snug text-[var(--text)]">{decodeHtml(result.title)}</h3>
                  <p class="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{extractDomain(result.url)} • {result.meta?.age || ''}</p>
                  <p class="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{decodeHtml(result.description)}</p>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if videoResults.length > 0}
          <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div class="px-3.5 py-2 border-b border-[var(--border)] bg-[var(--surface-hover)]/50">
              <span class="text-xs font-medium text-[var(--text-secondary)]">Videos</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
              {#each videoResults.slice(0, 4) as result}
                <a href={result.url} target="_blank" rel="noopener" class="block p-3 hover:bg-[var(--surface-hover)] transition-colors">
                  <div class="relative aspect-video rounded-md overflow-hidden bg-[var(--surface-hover)] mb-2">
                    <img src={result.thumbnail?.src} alt={result.title} class="h-full w-full object-cover" loading="lazy" />
                    {#if result.meta?.duration}
                      <span class="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">{result.meta.duration}</span>
                    {/if}
                  </div>
                  <h3 class="text-xs font-medium text-[var(--text)] line-clamp-2">{decodeHtml(result.title)}</h3>
                  <p class="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{extractDomain(result.meta?.url || result.url)}</p>
                </a>
              {/each}
            </div>
          </div>
        {/if}

      {:else if activeTab === 'images'}
        <!-- Images grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {#each feed as item}
            {@const result = item.data}
            <button
              onclick={() => showImageLightbox = result}
              class="group block w-full text-left overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all hover:border-[var(--border-strong)]"
            >
              <div class="aspect-square overflow-hidden bg-[var(--surface-hover)]">
                <img src={result.thumbnail?.src} alt={result.title} class="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              </div>
              <div class="p-2">
                <p class="truncate text-[10px] text-[var(--text-secondary)]">{extractDomain(result.properties?.url || result.url)}</p>
              </div>
            </button>
          {/each}
        </div>

      {:else if activeTab === 'videos'}
        <!-- Videos grid -->
        <div class="grid gap-2 sm:grid-cols-2">
          {#each feed as item}
            {@const result = item.data}
            <a href={result.url} target="_blank" rel="noopener" class="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all hover:border-[var(--border-strong)]">
              <div class="relative aspect-video overflow-hidden bg-[var(--surface-hover)]">
                <img src={result.thumbnail?.src} alt={result.title} class="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                {#if result.meta?.duration}
                  <span class="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">{result.meta.duration}</span>
                {/if}
              </div>
              <div class="p-3">
                <h3 class="text-sm font-medium text-[var(--text)] line-clamp-2">{decodeHtml(result.title)}</h3>
                <p class="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{extractDomain(result.meta?.url || result.url)} • {formatAge(result.meta?.page_age)}</p>
              </div>
            </a>
          {/each}
        </div>

      {:else if activeTab === 'news'}
        <!-- News list -->
        <div class="space-y-2">
          {#each feed as item}
            {@const result = item.data}
            <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:border-[var(--border-strong)] transition-colors">
              <a href={result.url} target="_blank" rel="noopener" class="block">
                <h3 class="font-heading text-sm leading-snug text-[var(--text)]">{decodeHtml(result.title)}</h3>
                <p class="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{extractDomain(result.url)} • {result.meta?.age || ''}</p>
                <p class="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{decodeHtml(result.description)}</p>
              </a>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Pagination -->
      {#if (activeTab === 'web' && webResults.length > 0) || (activeTab !== 'web' && feed.length > 0)}
        <div class="pt-4 flex flex-col items-center gap-3">
          {#if isLoading && offset > 0}
            <div class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"></div>
              Loading more...
            </div>
          {/if}

          <div class="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
            <!-- Previous -->
            {#if currentPage > 1}
              <button
                onclick={() => goToPage(currentPage - 1)}
                class="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-all"
              >
                ← Prev
              </button>
            {/if}

            <!-- Page numbers (desktop) -->
            {#each getPageNumbers() as p}
              <button
                onclick={() => goToPage(p)}
                class="rounded-full border text-xs font-medium px-3 py-1.5 transition-all {currentPage === p ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'}"
              >
                {p}
              </button>
            {/each}

            <!-- Next / Load More -->
            {#if hasMore}
              <button
                onclick={loadMore}
                class="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-all"
              >
                More →
              </button>
            {/if}
          </div>

          <span class="text-xs text-[var(--text-tertiary)]">
            {#if total > 0}
              {total.toLocaleString()} results
            {:else}
              Page {currentPage}
            {/if}
          </span>
        </div>
      {/if}

      <!-- Related queries -->
      {#if activeTab === 'web' && relatedQueries.length > 0}
        <div class="pt-6 border-t border-[var(--border)]">
          <p class="text-xs font-medium text-[var(--text-secondary)] mb-2">Related searches</p>
          <div class="flex flex-wrap gap-2">
            {#each relatedQueries as rq}
              <button
                onclick={() => { query = rq; offset = 0; search(); }}
                class="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all"
              >
                {rq}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  {:else if query && !isLoading}
    <div class="py-12 text-center">
      <p class="font-body text-base text-[var(--text-secondary)]">No results found for "{query}"</p>
      <p class="mt-1 text-xs text-[var(--text-tertiary)]">Try a different query or check your spelling.</p>
    </div>
  {/if}
</div>
</div>

<!-- Directions Modal -->
{#if directionsPlace}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onclick={(e) => { if (e.target === e.currentTarget) directionsPlace = null; }}>
    <div class="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-[var(--border)]">
        <h3 class="text-sm font-medium text-[var(--text)]">Open in Maps</h3>
        <p class="mt-0.5 text-xs text-[var(--text-tertiary)]">{directionsPlace.name}</p>
      </div>
      <div class="divide-y divide-[var(--border)]">
        <a href={`waze://?ll=${directionsPlace.lat},${directionsPlace.lon}&navigate=yes`} onclick={() => directionsPlace = null} class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors">
          <span class="text-lg">🚗</span>
          <span class="text-sm text-[var(--text)]">Waze</span>
        </a>
        {#if /iPad|iPhone|iPod/.test(navigator.userAgent)}
          <a href={`comgooglemaps://?daddr=${directionsPlace.lat},${directionsPlace.lon}&directionsmode=driving`} onclick={() => directionsPlace = null} class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors">
            <span class="text-lg">🗺️</span>
            <span class="text-sm text-[var(--text)]">Google Maps</span>
          </a>
        {:else}
          <a href={`geo:0,0?q=${directionsPlace.lat},${directionsPlace.lon}(${encodeURIComponent(directionsPlace.name)})`} onclick={() => directionsPlace = null} class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors">
            <span class="text-lg">🗺️</span>
            <span class="text-sm text-[var(--text)]">Google Maps</span>
          </a>
        {/if}
        <a href={`maps://?daddr=${directionsPlace.lat},${directionsPlace.lon}`} onclick={() => directionsPlace = null} class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors">
          <span class="text-lg">🍎</span>
          <span class="text-sm text-[var(--text)]">Apple Maps</span>
        </a>
      </div>
      <div class="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-hover)]/30">
        <button onclick={() => directionsPlace = null} class="w-full rounded-md py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Image Lightbox -->
{#if showImageLightbox}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onclick={(e) => { if (e.target === e.currentTarget) showImageLightbox = null; }}>
    <div class="relative max-w-3xl w-full">
      <button onclick={() => showImageLightbox = null} class="absolute -top-10 right-0 rounded-full p-2 text-white/80 hover:text-white transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
      <img src={showImageLightbox.thumbnail?.src || showImageLightbox.url} alt={showImageLightbox.title} class="max-h-[80vh] w-auto mx-auto rounded-lg object-contain" />
      <div class="mt-3 text-center">
        <p class="text-sm text-white/90">{showImageLightbox.title}</p>
        <a href={showImageLightbox.properties?.url || showImageLightbox.url} target="_blank" rel="noopener" class="mt-1 inline-block text-xs text-white/60 hover:text-white underline">
          {extractDomain(showImageLightbox.properties?.url || showImageLightbox.url)} →
        </a>
      </div>
    </div>
  </div>
{/if}

<!-- Keyboard Shortcuts Help -->
{#if showShortcuts}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onclick={(e) => { if (e.target === e.currentTarget) showShortcuts = false; }}>
    <div class="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 class="text-sm font-medium text-[var(--text)]">Keyboard Shortcuts</h3>
        <button onclick={() => showShortcuts = false} class="text-[var(--text-tertiary)] hover:text-[var(--text)] transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="px-4 py-3 space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Focus search</span><kbd class="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-[var(--text-tertiary)] font-mono">/</kbd></div>
        <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Close modal / blur input</span><kbd class="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-[var(--text-tertiary)] font-mono">Esc</kbd></div>
        <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Show this help</span><kbd class="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-[var(--text-tertiary)] font-mono">?</kbd></div>
        <div class="border-t border-[var(--border)] pt-2 mt-2">
          <p class="text-xs text-[var(--text-tertiary)] mb-1">Bangs</p>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Wikipedia</span><span class="text-xs text-[var(--text-tertiary)]">!w</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">YouTube</span><span class="text-xs text-[var(--text-tertiary)]">!yt</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">GitHub</span><span class="text-xs text-[var(--text-tertiary)]">!gh</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Reddit</span><span class="text-xs text-[var(--text-tertiary)]">!r</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Google</span><span class="text-xs text-[var(--text-tertiary)]">!g</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Stack Overflow</span><span class="text-xs text-[var(--text-tertiary)]">!so</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Amazon</span><span class="text-xs text-[var(--text-tertiary)]">!a</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">Images tab</span><span class="text-xs text-[var(--text-tertiary)]">!i</span></div>
          <div class="flex justify-between"><span class="text-[var(--text-secondary)]">News tab</span><span class="text-xs text-[var(--text-tertiary)]">!n</span></div>
        </div>
      </div>
    </div>
  </div>
{/if}
