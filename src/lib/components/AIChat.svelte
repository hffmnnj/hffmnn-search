<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { getMessages, getModel, setModel, addMessage, clearHistory } from '$lib/stores/aiChat';
  import type { ChatMessage, AIModel } from '$lib/types';

  let isOpen = $state(false);
  let input = $state('');
  let messages = $state<ChatMessage[]>([]);
  let isLoading = $state(false);
  let models = $state<AIModel[]>([]);
  let selectedModel = $state('gemma4:31b-cloud');
  let error = $state('');
  let modelsLoading = $state(false);
  let scrollEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    if (!browser) return;
    messages = getMessages();
    selectedModel = getModel();
    fetchModels();
  });

  async function fetchModels() {
    modelsLoading = true;
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        models = data.models || [];
        // If current model isn't in list, pick first
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
          messages: messages.slice(-20), // keep last 20 for context
          model: selectedModel,
          stream: false,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const data = await res.json();
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.response || '' };
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

  function toggle() {
    isOpen = !isOpen;
    if (isOpen) scrollToBottom();
  }
</script>

<!-- Toggle button (rendered in +layout via slot or direct import) -->
<button
  onclick={toggle}
  class="rounded-full p-2 text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-all"
  aria-label="AI Chat"
  title="AI Chat"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8V4H8"/>
    <rect width="16" height="12" x="4" y="8" rx="2"/>
    <path d="M2 14h2"/>
    <path d="M20 14h2"/>
    <path d="M15 13v2"/>
    <path d="M9 13v2"/>
  </svg>
</button>

<!-- Chat panel -->
{#if isOpen}
  <div class="fixed inset-0 z-[100] flex justify-end sm:justify-center">
    <!-- Backdrop -->
    <button
      class="absolute inset-0 bg-black/20 backdrop-blur-sm"
      onclick={() => (isOpen = false)}
      aria-label="Close chat"
    ></button>

    <!-- Panel -->
    <div class="relative z-10 flex h-full w-full flex-col bg-[var(--surface)] shadow-2xl sm:mt-16 sm:mb-6 sm:h-[calc(100%-6rem)] sm:max-h-[720px] sm:w-[480px] sm:rounded-2xl sm:border sm:border-[var(--border)] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--accent)]">
            <path d="M12 8V4H8"/>
            <rect width="16" height="12" x="4" y="8" rx="2"/>
            <path d="M2 14h2"/>
            <path d="M20 14h2"/>
            <path d="M15 13v2"/>
            <path d="M9 13v2"/>
          </svg>
          <span class="text-sm font-medium text-[var(--text)]">AI Chat</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- Model switcher -->
          <select
            value={selectedModel}
            onchange={handleModelChange}
            disabled={modelsLoading || isLoading}
            class="max-w-[140px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text-secondary)] outline-none hover:border-[var(--border-strong)]"
          >
            {#each models as model}
              <option value={model.id}>{model.name || model.id}</option>
            {:else}
              <option value={selectedModel}>Loading...</option>
            {/each}
          </select>

          <button
            onclick={onClear}
            class="rounded-full p-1.5 text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            title="Clear history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>

          <button
            onclick={() => (isOpen = false)}
            class="rounded-full p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {#if messages.length === 0}
          <div class="flex h-full flex-col items-center justify-center text-center">
            <div class="mb-3 rounded-full bg-[var(--surface-hover)] p-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--text-tertiary)]">
                <path d="M12 8V4H8"/>
                <rect width="16" height="12" x="4" y="8" rx="2"/>
                <path d="M2 14h2"/>
                <path d="M20 14h2"/>
                <path d="M15 13v2"/>
                <path d="M9 13v2"/>
              </svg>
            </div>
            <p class="text-sm text-[var(--text-secondary)]">Ask anything</p>
            <p class="mt-1 text-xs text-[var(--text-tertiary)]">History lasts 24 hours</p>
          </div>
        {:else}
          {#each messages as msg, i}
            {#if msg.role === 'user'}
              <div class="flex justify-end">
                <div class="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-2.5 text-sm text-white">
                  {msg.content}
                </div>
              </div>
            {:else}
              <div class="flex justify-start">
                <div class="max-w-[90%] space-y-1">
                  <div class="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            {/if}
          {/each}
        {/if}

        {#if isLoading}
          <div class="flex justify-start">
            <div class="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5">
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
      <div class="border-t border-[var(--border)] px-4 py-3">
        <div class="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 focus-within:border-[var(--accent)] transition-colors">
          <textarea
            bind:value={input}
            onkeydown={handleKeydown}
            placeholder="Message..."
            rows={1}
            class="max-h-32 flex-1 resize-none bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none"
          ></textarea>
          <button
            onclick={send}
            disabled={!input.trim() || isLoading}
            class="rounded-lg p-1.5 text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
          </button>
        </div>
        <p class="mt-1.5 text-center text-[10px] text-[var(--text-tertiary)]">
          Using {selectedModel} • History expires in 24h
        </p>
      </div>
    </div>
  </div>
{/if}
