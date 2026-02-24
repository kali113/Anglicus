<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { t } from '$lib/i18n';

	onMount(() => {
		// Use a full-page navigation so onboarding works even when client routing fails.
		const search = typeof window !== "undefined" ? window.location.search : "";
		window.location.replace(`${base}/placement-test${search}`);
	});
</script>

<div class="onboarding">
	<div class="spinner"></div>
	<p>{$t('onboarding.redirecting')}</p>
</div>

<style>
	.onboarding {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		color: var(--text-secondary);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--border);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
