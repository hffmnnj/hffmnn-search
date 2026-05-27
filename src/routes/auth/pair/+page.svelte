<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { HugeiconsIcon } from '@hugeicons/svelte';
import { Loading03Icon, Shield01Icon, TerminalIcon } from '@hugeicons/core-free-icons';

	let code = $state('');
	let loading = $state(true);
	let paired = $state(false);
	let returnUrl = $state('/');
	let error = $state('');
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		if (!browser) return;
		returnUrl = $page.url.searchParams.get('return') || '/';
		generateCode();
	});

	async function generateCode() {
		try {
			const res = await fetch('/api/auth/code', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to generate code');
			const data = await res.json();
			code = data.code;
			loading = false;
			startPolling();
		} catch (e: any) {
			error = e.message || 'Failed to generate pairing code';
			loading = false;
		}
	}

	function startPolling() {
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = setInterval(async () => {
			if (!code || paired) return;
			try {
				const res = await fetch(`/api/auth/status?code=${code}`);
				const data = await res.json();
				if (data.paired) {
					paired = true;
					if (pollInterval) clearInterval(pollInterval);
					setTimeout(() => {
						window.location.href = decodeURIComponent(returnUrl);
					}, 1500);
				}
			} catch {}
		}, 2000);
	}

	function copyCommand() {
		const host = browser ? window.location.host : 'search.hffmnn.com';
		const cmd = `hffmnn-auth pair ${host} ${code}`;
		navigator.clipboard.writeText(cmd);
	}
</script>

<svelte:head>
	<title>Authenticate — hffmnn Search</title>
</svelte:head>

<div class="min-h-[100dvh] flex items-center justify-center p-4" style="background: var(--bg);">
	<div class="w-full max-w-md flex flex-col gap-6">
		<div class="text-center">
			<div class="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center" style="background: var(--highlight);">
				<HugeiconsIcon icon={Shield01Icon} size={24} style="color: var(--accent);" />
			</div>
			<h1 class="text-2xl font-semibold mb-1" style="font-family: var(--font-heading); color: var(--text);">
				Authenticate Device
			</h1>
			<p class="text-sm" style="color: var(--text-secondary);">
				This device needs to be paired to access your search.
			</p>
		</div>

		{#if loading}
			<div class="flex items-center justify-center gap-2 py-8">
				<HugeiconsIcon icon={Loading03Icon} size={18} class="animate-spin" style="color: var(--text-tertiary);" />
				<span class="text-sm" style="color: var(--text-tertiary);">Generating pairing code...</span>
			</div>
		{:else if paired}
			<div class="surface-card p-6 text-center">
				<div class="text-4xl mb-2">✅</div>
				<h2 class="text-lg font-medium mb-1" style="color: var(--text);">Device Paired</h2>
				<p class="text-sm" style="color: var(--text-secondary);">Redirecting to search...</p>
			</div>
		{:else}
			<div class="surface-card p-6 flex flex-col gap-4">
				<div class="text-center">
					<p class="text-xs uppercase tracking-wider mb-2" style="color: var(--text-tertiary);">Your Pairing Code</p>
					<div class="font-mono text-4xl font-bold tracking-[0.2em]" style="color: var(--accent);">
						{code}
					</div>
					<p class="text-xs mt-2" style="color: var(--text-tertiary);">Expires in 5 minutes</p>
				</div>

				<div class="border-t" style="border-color: var(--border);"></div>

				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium" style="color: var(--text);">
						<HugeiconsIcon icon={TerminalIcon} size={14} class="inline mr-1" />
						Run this on your machine:
					</p>
					<button
						onclick={copyCommand}
						class="text-left font-mono text-sm p-3 rounded-lg border transition-all hover:brightness-95"
						style="border-color: var(--border); background: var(--bg); color: var(--text-secondary);"
					>
						hffmnn-auth pair {browser ? window.location.host : 'search.hffmnn.com'} {code}
					</button>
					<p class="text-xs" style="color: var(--text-tertiary);">
						Click to copy. Waiting for pairing...
					</p>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="px-4 py-3 rounded-xl text-sm" style="background: #9B2C2C15; color: var(--error);">
				{error}
			</div>
		{/if}
	</div>
</div>
