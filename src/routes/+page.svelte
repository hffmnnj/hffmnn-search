<script lang="ts">
	import { goto } from '$app/navigation';

	let query = $state('');
	let isFocused = $state(false);

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (query.trim()) {
			goto(`/search?q=${encodeURIComponent(query.trim())}`);
		}
	}
</script>

<svelte:head>
	<title>hffmnn</title>
</svelte:head>

<div class="flex flex-1 flex-col items-center justify-center overflow-hidden">
	<div class="mb-12 text-center">
		<h1 class="font-heading text-5xl tracking-wide text-[var(--text)] md:text-7xl">
			hffmnn
		</h1>
	</div>

	<form onsubmit={handleSubmit} class="w-full max-w-2xl">
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
				onfocus={() => isFocused = true}
				onblur={() => isFocused = false}
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
	</form>
</div>
