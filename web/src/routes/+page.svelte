<script lang="ts">
	import { onMount } from 'svelte';
	import { hasCompletedOnboarding, getUserProfile, updateStreakDays } from '$lib/storage/user-store';
	import type { UserProfile } from '$lib/types/user';

	let userProfile = $state<UserProfile | null>(null);

	onMount(() => {
		if (!hasCompletedOnboarding()) {
			window.location.href = '/onboarding';
			return;
		}

		userProfile = getUserProfile();
		updateStreakDays();
	});
</script>

{#if userProfile}
	<div class="home">
		<header class="header">
			<h1>Hola, {userProfile.name}!</h1>
			<div class="streak">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
				<span>{userProfile.streakDays} días</span>
			</div>
		</header>

		<section class="level-card">
			<div class="level-badge">
				Nivel {userProfile.level}
			</div>
			<p>Objetivo: {userProfile.goals.map(g => {
				const goalMap: Record<typeof g, string> = { travel: 'Viajes', work: 'Trabajo', study: 'Estudios', movies: 'Cine', general: 'General' };
				return goalMap[g];
			}).join(', ')}</p>
		</section>

		<section class="actions">
			<a href="/tutor" class="action-card primary">
				<div class="icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
				</div>
				<div class="content">
					<h2>Practicar con el Tutor</h2>
					<p>Conversa con la IA para mejorar tu inglés</p>
				</div>
			</a>

			<a href="/exercises" class="action-card secondary">
				<div class="icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
				</div>
				<div class="content">
					<h2>Hacer Ejercicios</h2>
					<p>Ejercicios adaptados a tu nivel</p>
				</div>
			</a>
		</section>

		{#if userProfile.weakAreas.length > 0}
			<section class="weak-areas">
				<h3>Áreas a mejorar</h3>
				<div class="tags">
					{#each userProfile.weakAreas as area}
						<span class="tag">{area}</span>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}

<style>
	.home {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header h1 {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
	}

	.streak {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--warning);
		font-weight: 600;
	}

	.level-card {
		background: linear-gradient(135deg, var(--primary), var(--primary-dark));
		color: white;
		padding: 1.5rem;
		border-radius: 16px;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.level-badge {
		display: inline-block;
		background: rgba(255, 255, 255, 0.2);
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.level-card p {
		margin: 0;
		opacity: 0.9;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.action-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: 16px;
		text-decoration: none;
		color: inherit;
		background: var(--bg);
		border: 1px solid var(--border);
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.action-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.action-card.primary {
		background: linear-gradient(135deg, #ecfdf5, #d1fae5);
		border-color: #10b981;
	}

	.action-card.secondary {
		background: linear-gradient(135deg, #eff6ff, #dbeafe);
		border-color: var(--primary);
	}

	.action-card .icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 12px;
		color: var(--text);
	}

	.action-card .content h2 {
		margin: 0 0 0.25rem 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.action-card .content p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.weak-areas h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		background: var(--bg);
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.875rem;
		border: 1px solid var(--border);
	}
</style>
