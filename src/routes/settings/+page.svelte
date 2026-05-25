<script lang="ts">
  import { onMount } from 'svelte';

  let braveKey = $state('');
  let ollamaKey = $state('');
  let resultsPerPage = $state('10');
  let safeSearch = $state('moderate');
  let showAiSummary = $state(true);
  let saved = $state(false);

  onMount(() => {
    braveKey = localStorage.getItem('brave_key') || '';
    ollamaKey = localStorage.getItem('ollama_key') || '';
    resultsPerPage = localStorage.getItem('results_per_page') || '10';
    safeSearch = localStorage.getItem('safe_search') || 'moderate';
    showAiSummary = localStorage.getItem('show_ai_summary') !== 'false';
  });

  function save() {
    localStorage.setItem('brave_key', braveKey);
    localStorage.setItem('ollama_key', ollamaKey);
    localStorage.setItem('results_per_page', resultsPerPage);
    localStorage.setItem('safe_search', safeSearch);
    localStorage.setItem('show_ai_summary', String(showAiSummary));
    saved = true;
    setTimeout(() => saved = false, 2000);
  }
</script>

<svelte:head>
  <title>Settings — hffmnn search</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
  <h1 class="mb-8 font-heading text-4xl">Settings</h1>

  <div class="space-y-8">
    <section class="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 class="mb-4 font-heading text-xl">API Keys</h2>
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Brave Search API Key</label>
          <input
            type="password"
            bind:value={braveKey}
            placeholder="Enter your Brave API key"
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <p class="mt-1 text-xs text-[var(--text-tertiary)]">
            Get your key from <a href="https://api.search.brave.com" target="_blank" class="text-[var(--accent)] hover:underline">api.search.brave.com</a>
          </p>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Ollama Cloud API Key</label>
          <input
            type="password"
            bind:value={ollamaKey}
            placeholder="Enter your Ollama API key"
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 class="mb-4 font-heading text-xl">Search Preferences</h2>
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Results per page</label>
          <select bind:value={resultsPerPage} class="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Safe search</label>
          <select bind:value={safeSearch} class="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none">
            <option value="moderate">Moderate</option>
            <option value="strict">Strict</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div class="flex items-center gap-3">
          <input type="checkbox" bind:checked={showAiSummary} class="h-4 w-4 accent-[var(--accent)]" />
          <label class="text-sm text-[var(--text)]">Show AI summaries</label>
        </div>
      </div>
    </section>

    <button
      onclick={save}
      class="rounded-full bg-[var(--accent)] px-8 py-3 font-body text-white hover:bg-[var(--accent-hover)] transition-colors"
    >
      {saved ? 'Saved!' : 'Save Settings'}
    </button>
  </div>
</div>
