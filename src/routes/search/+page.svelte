<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';

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

  async function search() {
    if (!query.trim()) return;
    isLoading = true;
    error = '';
    if (offset === 0) spellSuggestion = '';
    if (offset === 0) aiOverview = '';

    const params = new URLSearchParams({ q: query.trim(), count: '20' });
    if (freshness && activeTab !== 'images') params.set('freshness', freshness);
    if (activeTab === 'videos' && freshness) params.set('freshness', freshness);
    if (offset > 0) params.set('offset', String(offset));

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

        if (offset === 0) {
          webResults = newWeb;
          newsResults = newNews;
          videoResults = newVideos;
          feed = newFeed;
          currentPage = 1;
          if (data.altered && data.altered !== query.trim()) {
            spellSuggestion = data.altered;
          }
          loadOverview(query, newWeb.slice(0, 5));
        } else {
          // Append new results, dedupe by URL
          const seen = new Set(webResults.map(r => r.url));
          webResults = [...webResults, ...newWeb.filter((r: any) => !seen.has(r.url))];
          newsResults = [...newsResults, ...newNews.filter((r: any) => !seen.has(r.url))];
          videoResults = [...videoResults, ...newVideos.filter((r: any) => !seen.has(r.url))];
          feed = [...feed, ...newFeed.filter((r: any) => !seen.has(r.data?.url))];
          currentPage += 1;
        }
        total = data.total || 0;
        hasMore = offset < 9 && newWeb.length > 0;
      } else {
        const newResults = (data.results || []).map((r: any) => ({
          type: activeTab === 'news' ? 'news' : activeTab === 'videos' ? 'video' : 'image',
          data: r
        }));
        if (offset === 0) {
          feed = newResults;
          currentPage = 1;
        } else {
          const seen = new Set(feed.map(f => f.data?.url));
          feed = [...feed, ...newResults.filter((r: any) => !seen.has(r.data?.url))];
          currentPage += 1;
        }
        total = data.total || 0;
        hasMore = offset < 9 && newResults.length > 0;
      }
    } catch (e: any) {
      error = e.message || 'Search failed';
    } finally {
      isLoading = false;
    }
  }

  async function loadOverview(q: string, results: any[]) {
    isOverviewLoading = true;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Give me a concise 2-3 sentence overview of "${q}" based on these search results. Be factual and cite sources.`,
          context: { query: q, results }
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
    search();
  }

  function loadMore() {
    offset += 1;
    search();
  }

  function goToPage(pageNum: number) {
    offset = pageNum - 1;
    search();
  }

  $effect(() => {
    if (browser && query) {
      offset = 0;
      search();
    }
  });
</script>

<svelte:head>
  <title>{query ? `${query} — hffmnn` : 'hffmnn'}</title>
</svelte:head>

<div class="py-8">
  <div class="mx-auto max-w-5xl">
  <!-- Search bar -->
  <form onsubmit={handleSubmit} class="mb-5">
    <div class="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-[var(--accent)]">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="text-[var(--text-tertiary)]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        type="text"
        bind:value={query}
        placeholder="Search..."
        class="flex-1 bg-transparent font-body text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-tertiary)]"
      />
      {#if query}
        <button
          type="button"
          onclick={() => { query = ''; }}
          class="rounded-full p-1 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Clear"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      {/if}
      <button type="submit" class="rounded-full bg-[var(--accent)] px-4 py-1 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors">
        Search
      </button>
    </div>
  </form>

  <!-- Spell suggestion -->
  {#if spellSuggestion && spellSuggestion !== query}
    <div class="mb-3 text-sm text-[var(--text-secondary)]">
      Did you mean <button class="font-medium text-[var(--accent)] hover:underline" onclick={() => { query = spellSuggestion; offset = 0; search(); }}>{spellSuggestion}</button>?
    </div>
  {/if}

  <!-- Tab bar -->
  <div class="mb-4 flex items-center gap-0.5 border-b border-[var(--border)]">
    {#each tabs as tab}
      <button
        onclick={() => switchTab(tab.id)}
        class="relative px-3 py-2 text-sm font-medium transition-colors {activeTab === tab.id ? 'text-[var(--text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'}"
      >
        {tab.label}
        {#if activeTab === tab.id}
          <span class="absolute bottom-0 left-1 right-1 h-[2px] bg-[var(--accent)] rounded-full"></span>
        {/if}
      </button>
    {/each}

    <div class="ml-auto pb-1.5">
      <select
        bind:value={freshness}
        onchange={() => { offset = 0; search(); }}
        class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)] outline-none hover:border-[var(--border-strong)]"
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
  {#if isLoading && offset === 0}
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
            <p class="text-sm leading-relaxed text-[var(--text)]">{aiOverview}</p>
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
              <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--surface-hover)]/50">
                {#if group.favicon}
                  <img src={group.favicon} alt="" class="h-4 w-4 rounded-full" loading="lazy" />
                {:else}
                  <div class="h-4 w-4 rounded-full bg-[var(--border-strong)]"></div>
                {/if}
                <span class="text-xs font-medium text-[var(--text-secondary)]">{domain}</span>
                <span class="text-[10px] text-[var(--text-tertiary)] bg-[var(--border)] px-1.5 py-0.5 rounded-full">{group.results.length}</span>
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
                <div class="flex items-start gap-2.5">
                  {#if result.profile?.img}
                    <img src={result.profile.img} alt="" class="mt-0.5 h-4 w-4 rounded-full shrink-0" loading="lazy" />
                  {/if}
                  <div class="min-w-0">
                    <h3 class="font-heading text-sm leading-snug text-[var(--text)]">{decodeHtml(result.title)}</h3>
                    <p class="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                      <span class="text-[var(--text-secondary)]">{domain}</span>
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
            <a href={result.properties?.url || result.url} target="_blank" rel="noopener" class="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all hover:border-[var(--border-strong)]">
              <div class="aspect-square overflow-hidden bg-[var(--surface-hover)]">
                <img src={result.thumbnail?.src} alt={result.title} class="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              </div>
              <div class="p-2">
                <p class="truncate text-[10px] text-[var(--text-secondary)]">{extractDomain(result.properties?.url || result.url)}</p>
              </div>
            </a>
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
      {#if hasMore || (activeTab === 'web' && webResults.length > 0) || (activeTab !== 'web' && feed.length > 0)}
        <div class="pt-4 flex flex-col items-center gap-3">
          {#if isLoading && offset > 0}
            <div class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"></div>
              Loading more...
            </div>
          {/if}

          <div class="flex items-center gap-2">
            {#if currentPage > 1}
              <button
                onclick={() => goToPage(currentPage - 1)}
                class="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-all"
              >
                Previous
              </button>
            {/if}

            <span class="text-xs text-[var(--text-tertiary)] px-2">
              Page {currentPage}
              {#if total > 0}
                <span class="mx-1">•</span>
                {total.toLocaleString()} results
              {/if}
            </span>

            {#if hasMore}
              <button
                onclick={loadMore}
                class="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-all"
              >
                Next
              </button>
            {/if}
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
