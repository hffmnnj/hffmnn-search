<script lang="ts">
  import { onMount } from 'svelte';

  let resultsPerPage = $state('10');
  let safeSearch = $state('moderate');
  let showAiSummary = $state(true);
  let saved = $state(false);

  onMount(() => {
    resultsPerPage = localStorage.getItem('results_per_page') || '10';
    safeSearch = localStorage.getItem('safe_search') || 'moderate';
    showAiSummary = localStorage.getItem('show_ai_summary') !== 'false';
  });

  function save() {
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
      <h2 class="mb-4 font-heading text-xl">Search Preferences</h2>
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--text-secondary)]" for="results">Results per page</label>
          <select id="results" bind:value={resultsPerPage} class="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--text-secondary)]" for="safesearch">Safe search</label>
          <select id="safesearch" bind:value={safeSearch} class="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] outline-none">
            <option value="moderate">Moderate</option>
            <option value="strict">Strict</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div class="flex items-center gap-3">
          <input id="ai" type="checkbox" bind:checked={showAiSummary} class="h-4 w-4 accent-[var(--accent)]" />
          <label for="ai" class="text-sm text-[var(--text)]">Show AI summaries</label>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 class="mb-4 font-heading text-xl">About</h2>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">
        hffmnn search is a private, self-hosted search engine powered by <a href="https://brave.com/search/api/" target="_blank" class="text-[var(--accent)] hover:underline">Brave Search API</a> and <a href="https://ollama.com" target="_blank" class="text-[var(--accent)] hover:underline">Ollama Cloud</a>. No tracking, no ads, total control.
      </p>
      <div class="mt-4 space-y-2 text-xs text-[var(--text-tertiary)]">
        <p>API keys are configured server-side via <code class="bg-[var(--bg)] px-1 py-0.5 rounded">.env</code> file only.</p>
        <p>Edit <code class="bg-[var(--bg)] px-1 py-0.5 rounded">.env</code> and restart the service.</p>
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
