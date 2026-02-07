<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	onMount(() => {
		// Redirect to the new placement test
		goto(`${base}/placement-test`);
	});
</script>

<div class="onboarding">
	<p>Redirigiendo al test de nivel...</p>
</div>

<style>
	.onboarding {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
