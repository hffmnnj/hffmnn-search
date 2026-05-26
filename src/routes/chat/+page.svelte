<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { mdToHtml } from '$lib/md';
  import { getMessages, getModel, setModel, addMessage, clearHistory } from '$lib/stores/aiChat';
  import type { ChatMessage, AIModel } from '$lib/types';

  let input = $state('');
  let messages = $state<ChatMessage[]>([]);
  let isLoading = $state(false);
  let models = $state<AIModel[]>([]);
  let selectedModel = $state('gemma4:31b-cloud');
  let error = $state('');
  let modelsLoading = $state(false);
  let scrollEl = $state<HTMLDivElement | null>(null);
  let forceSearch = $state(false);

  onMount(() => {
    if (!browser) return;
    messages = getMessages();
    selectedModel = getModel();
    fetchModels();
    scrollToBottom();
  });

  async function fetchModels() {
    modelsLoading = true;
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        models = data.models || [];
        const ids = models.map((m) => m.id);
        if (ids.length > 0 && !ids.includes(selectedModel)) {
          selectedModel = ids[0];
          setModel(selectedModel);
        }
      }
    } catch (e) {
      console.error('Failed to load models:', e);
    } finally {
      modelsLoading = false;
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    messages = [...messages, userMsg];
    addMessage(userMsg);
    input = '';
    error = '';
    isLoading = true;
    scrollToBottom();

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.slice(-20),
          model: selectedModel,
          stream: false,
          search: forceSearch,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const data = await res.json();
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.response || '', searched: data.searched || false };
      messages = [...messages, assistantMsg];
      addMessage(assistantMsg);
    } catch (e: any) {
      error = e.message || 'Failed to get response';
    } finally {
      isLoading = false;
      scrollToBottom();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    });
  }

  function handleModelChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedModel = target.value;
    setModel(selectedModel);
  }

  function onClear() {
    clearHistory();
    messages = [];
    error = '';
  }
</script>

<svelte:head>
  <title>AI Chat — hffmnn</title>
</svelte:head>

<div class="flex h-[calc(100dvh-73px)] flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
    <div class="flex items-center gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--accent)]">
        <path d="M12 8V4H8"/>
        <rect width="16" height="12" x="4" y="8" rx="2"/>
        <path d="M2 14h2"/>
        <path d="M20 14h2"/>
        <path d="M15 13v2"/>
        <path d="M9 13v2"/>
      </svg>
      <h1 class="font-heading text-xl text-[var(--text)]">AI Chat</h1>
    </div>

    <div class="flex items-center gap-3">
      <!-- Model switcher -->
      <select
        value={selectedModel}
        onchange={handleModelChange}
        disabled={modelsLoading || isLoading}
        class="max-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-secondary)] outline-none hover:border-[var(--border-strong)]"
      >
        {#each models as model}
          <option value={model.id}>{model.name || model.id}</option>
        {:else}
          <option value={selectedModel}>Loading...</option>
        {/each}
      </select>

      <button
        onclick={() => forceSearch = !forceSearch}
        class="rounded-full p-2 transition-colors {forceSearch ? 'text-[var(--accent)] bg-[var(--surface-hover)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'}"
        title={forceSearch ? 'Web search enabled' : 'Enable web search'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </button>

      <button
        onclick={onClear}
        class="rounded-full p-2 text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        title="Clear history"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-6 py-6 space-y-4">
    {#if messages.length === 0}
      <div class="flex h-full flex-col items-center justify-center text-center">
        <div class="mb-4 rounded-full bg-[var(--surface-hover)] p-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--text-tertiary)]">
            <path d="M12 8V4H8"/>
            <rect width="16" height="12" x="4" y="8" rx="2"/>
            <path d="M2 14h2"/>
            <path d="M20 14h2"/>
            <path d="M15 13v2"/>
            <path d="M9 13v2"/>
          </svg>
        </div>
        <p class="text-[var(--text-secondary)]">Ask anything</p>
        <p class="mt-1 text-sm text-[var(--text-tertiary)]">History lasts 24 hours</p>
      </div>
    {:else}
      {#each messages as msg}
        {#if msg.role === 'user'}
          <div class="flex justify-end">
            <div class="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--accent)] px-5 py-3 text-sm text-white leading-relaxed">
              {msg.content}
            </div>
          </div>
        {:else}
          <div class="flex justify-start">
            <div class="max-w-[85%]">
              <div class="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg)] px-5 py-3 text-sm leading-relaxed text-[var(--text)] prose prose-sm max-w-none">
                {@html mdToHtml(msg.content)}
              </div>
              {#if msg.searched}
                <div class="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  Searched the web
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    {/if}

    {#if isLoading}
      <div class="flex justify-start">
        <div class="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg)] px-5 py-3">
          <div class="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" style="animation-delay: 0ms"></div>
          <div class="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" style="animation-delay: 150ms"></div>
          <div class="h-2 w-2 animate-bounce rounded-full bg-[var(--accent)]" style="animation-delay: 300ms"></div>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="rounded-lg border border-[var(--error)] bg-red-50 dark:bg-red-950/20 p-3 text-xs text-[var(--error)]">
        {error}
      </div>
    {/if}
  </div>

  <!-- Input -->
  <div class="border-t border-[var(--border)] px-6 py-4">
    <div class="mx-auto max-w-3xl">
      <div class="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 focus-within:border-[var(--accent)] transition-colors">
        <textarea
          bind:value={input}
          onkeydown={handleKeydown}
          placeholder="Message..."
          rows={1}
          class="max-h-40 flex-1 resize-none bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none"
        ></textarea>
        <button
          onclick={send}
          disabled={!input.trim() || isLoading}
          aria-label="Send message"
          class="rounded-lg p-2 text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
        </button>
      </div>
      <p class="mt-2 text-center text-[10px] text-[var(--text-tertiary)]">
        Using {selectedModel} {forceSearch ? '• Web search on' : ''} • History expires in 24h
      </p>
    </div>
  </div>
</div>
