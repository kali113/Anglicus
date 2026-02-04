<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { hasCompletedOnboarding } from '$lib/storage/user-store';

	let { children } = $props();
	let showNav = $state(true);
	let onboardingComplete = $state(false);

	onMount(() => {
		onboardingComplete = hasCompletedOnboarding();
	});

	// Don't show nav on onboarding pages
	$effect(() => {
		showNav = onboardingComplete && !$page.url.pathname.startsWith('/onboarding');
	});
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.json" />
	<meta name="theme-color" content="#3b82f6" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<link rel="apple-touch-icon" href="/icons/icon-152x152.png" />
</svelte:head>

<div class="app">
	<main class="main">
		{@render children()}
	</main>

	{#if showNav}
		<nav class="nav">
			<a href="/" class:active={$page.url.pathname === '/'} aria-label="Inicio">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
			</a>
			<a href="/tutor" class:active={$page.url.pathname.startsWith('/tutor')} aria-label="Tutor">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
			</a>
			<a href="/exercises" class:active={$page.url.pathname.startsWith('/exercises')} aria-label="Ejercicios">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
			</a>
			<a href="/settings" class:active={$page.url.pathname.startsWith('/settings')} aria-label="Configuración">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/><path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24"/><path d="M1 12h6m6 0h6"/><path d="m4.93 19.07 4.24-4.24m5.66-5.66 4.24-4.24"/></svg>
			</a>
		</nav>
	{/if}
</div>

<style>
	:global(:root) {
		--primary: #3b82f6;
		--primary-dark: #2563eb;
		--success: #22c55e;
		--warning: #f59e0b;
		--error: #ef4444;
		--bg: #ffffff;
		--bg-secondary: #f3f4f6;
		--text: #111827;
		--text-secondary: #6b7280;
		--border: #e5e7eb;
		--nav-height: 60px;
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		background: var(--bg-secondary);
		color: var(--text);
	}

	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.main {
		flex: 1;
		padding: 1rem;
		padding-bottom: calc(var(--nav-height) + 1rem);
		max-width: 600px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}

	.nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: var(--nav-height);
		background: var(--bg);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: space-around;
		align-items: center;
		z-index: 100;
	}

	.nav a {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		text-decoration: none;
		padding: 0.5rem 1rem;
		transition: all 0.2s;
	}

	.nav a:hover {
		color: var(--primary);
	}

	.nav a.active {
		color: var(--primary);
	}

	@media (min-width: 768px) {
		.nav {
			left: 50%;
			transform: translateX(-50%);
			max-width: 600px;
			border-radius: 16px 16px 0 0;
			border-left: 1px solid var(--border);
			border-right: 1px solid var(--border);
		}
	}
</style>
