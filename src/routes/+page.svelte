<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { mdToHtml } from '$lib/md';
	import { parseBang, buildBangUrl } from '$lib/bangs';

	let query = $state('');
	let isFocused = $state(false);
	let suggestions = $state<string[]>([]);
	let showSuggestions = $state(false);
	let newsStories = $state<any[]>([]);
	let newsSummary = $state('');
	let isNewsLoading = $state(true);
	let newsError = $state('');

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function renderMd(text: string): string {
		return mdToHtml(text);
	}

	async function fetchSuggestions() {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			suggestions = [];
			return;
		}
		try {
			const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(trimmed)}`);
			if (res.ok) {
				const data = await res.json();
				suggestions = data.suggestions || [];
			}
		} catch (e) {
			suggestions = [];
		}
	}

	function onInput() {
		showSuggestions = true;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(fetchSuggestions, 150);
	}

	function selectSuggestion(s: string) {
		query = s;
		suggestions = [];
		showSuggestions = false;
		goto(`/search?q=${encodeURIComponent(s)}`);
	}

	function onBlur() {
		// Delay hiding so clicks on suggestions register
		setTimeout(() => { showSuggestions = false; }, 200);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		const trimmed = query.trim();
		if (!trimmed) return;

		const { bang, rest } = parseBang(trimmed);
		if (bang) {
			if (bang.internal && bang.tab) {
				goto(`/search?q=${encodeURIComponent(rest || trimmed)}&tab=${bang.tab}`);
				return;
			}
			if (bang.url) {
				const url = buildBangUrl(bang, rest || trimmed);
				window.open(url, '_blank');
				return;
			}
		}

		goto(`/search?q=${encodeURIComponent(trimmed)}`);
	}

	onMount(() => {
		loadNews();
	});

	async function loadNews() {
		isNewsLoading = true;
		try {
			const res = await fetch('/api/news-today?limit=10&region=us');
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			newsStories = data.stories || [];

			// Generate AI summary of top 5 stories
			if (newsStories.length > 0) {
				generateSummary(newsStories.slice(0, 5));
			}
		} catch (e: any) {
			newsError = e.message || 'Failed to load news';
		} finally {
			isNewsLoading = false;
		}
	}

	async function generateSummary(stories: any[]) {
		const context = stories.map((s, i) => `${i + 1}. ${s.emoji || ''} ${s.title}: ${s.short_summary || ''}`).join('\n');
		try {
			const res = await fetch('/api/ai-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [
						{ role: 'user', content: `Summarize these top news stories in 2-3 concise sentences. Be factual and neutral.\n\n${context}` }
					],
					model: 'gemma4:31b-cloud',
				}),
			});
			if (res.ok) {
				const data = await res.json();
				newsSummary = data.response || '';
			}
		} catch (e) {
			console.error('Summary failed:', e);
		}
	}
</script>

<svelte:head>
	<title>hffmnn</title>
</svelte:head>

<div class="flex flex-1 flex-col items-center overflow-hidden py-8">
	<div class="mb-10 text-center">
		<h1 class="font-heading text-5xl tracking-wide text-[var(--text)] md:text-7xl">
			hffmnn
		</h1>
	</div>

	<form onsubmit={handleSubmit} class="w-full max-w-2xl mb-8">
		<div
			class="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-6 py-4 shadow-sm transition-all duration-200"
			class:shadow-md={isFocused}
			class:border-[var(--border-strong)]={isFocused}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-[var(--text-tertiary)]"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			<input
				type="text"
				bind:value={query}
				oninput={onInput}
				onfocus={() => isFocused = true}
				onblur={onBlur}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						suggestions = [];
						handleSubmit(e);
					} else if (e.key === 'Escape') {
						suggestions = [];
						showSuggestions = false;
					}
				}}
				placeholder="What are you looking for?"
				class="flex-1 bg-transparent font-body text-lg text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none"
			/>
			{#if query}
				<button
					type="button"
					onclick={() => query = ''}
					class="text-[var(--text-tertiary)] hover:text-[var(--text)] transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			{/if}
		</div>

		{#if showSuggestions && suggestions.length > 0}
			<div class="mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden">
				{#each suggestions as s}
					<button
						type="button"
						onclick={() => selectSuggestion(s)}
						class="w-full text-left px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="text-[var(--text-tertiary)] shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
						<span class="truncate">{s}</span>
					</button>
				{/each}
			</div>
		{/if}
	</form>

	<!-- News Section -->
	<div class="w-full max-w-2xl">
		<div class="flex items-center gap-2 mb-3">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--accent)]"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
			<h2 class="text-sm font-medium text-[var(--text)]">Today's News</h2>
			{#if isNewsLoading}
				<div class="h-3 w-3 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] ml-auto"></div>
			{/if}
		</div>

		{#if newsError}
			<p class="text-xs text-[var(--error)]">{newsError}</p>
		{:else if newsStories.length > 0}
			<!-- AI Summary -->
			{#if newsSummary}
				<div class="rounded-lg border border-[var(--border)] bg-[var(--highlight)] p-3 mb-3">
					<div class="flex items-center gap-1.5 mb-1">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-[var(--accent)]"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
						<span class="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">AI Summary</span>
					</div>
					<div class="text-xs leading-relaxed text-[var(--text-secondary)] prose prose-sm max-w-none">
						{@html renderMd(newsSummary)}
					</div>
				</div>
			{/if}

			<div class="space-y-2">
				{#each newsStories.slice(0, 8) as story}
					<button
						onclick={() => goto(`/search?q=${encodeURIComponent(story.title)}`)}
						class="w-full text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:bg-[var(--surface-hover)] transition-colors"
					>
						<div class="flex items-start gap-2.5">
							{#if story.image_url}
								<img src={story.image_url} alt={story.image_caption || ''} class="h-10 w-10 rounded-md object-cover shrink-0" loading="lazy" />
							{:else}
								<span class="text-lg shrink-0">{story.emoji || '📰'}</span>
							{/if}
							<div class="min-w-0">
<p class="text-xs font-medium text-[var(--text)] line-clamp-2">{story.title}</p>
							{#if story.short_summary}
								<p class="text-[10px] text-[var(--text-tertiary)] line-clamp-1 mt-0.5">{story.short_summary.slice(0, 120)}{story.short_summary.length > 120 ? '...' : ''}</p>
							{/if}
								<p class="text-[9px] text-[var(--text-tertiary)] mt-0.5">{story.category_name || 'General'}</p>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{:else if !isNewsLoading}
			<p class="text-xs text-[var(--text-tertiary)]">No news available. Check back later.</p>
		{/if}
	</div>
</div>
