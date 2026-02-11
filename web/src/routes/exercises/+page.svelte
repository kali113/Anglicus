<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { getUserProfile } from '$lib/storage/user-store.js';
	import {
		AiRequestError,
		getCompletion,
		buildExerciseSystemPrompt
	} from '$lib/ai/index.js';
	import type { Exercise } from '$lib/types/exercise.js';
	import type { UserProfile } from '$lib/types/user.js';
	import PaywallModal from '$lib/components/PaywallModal.svelte';
	import { getFeatureLabel, markPaywallShown } from '$lib/billing/index.js';
	import { t } from '$lib/i18n';

	let profile = $state<Awaited<ReturnType<typeof getUserProfile>>>(null);
	let exercises = $state<Exercise[]>([]);
	let loading = $state(false);
	let currentExerciseIndex = $state(0);
	let selectedAnswer = $state('');
	let showResult = $state(false);
	let isCorrect = $state(false);
	let errorMessage = $state('');
	let showPaywall = $state(false);
	let paywallMode = $state<'nag' | 'block'>('block');
	let paywallFeature = $state(getFeatureLabel('tutor'));

	onMount(async () => {
		profile = await getUserProfile();
		if (!profile) {
			window.location.href = `${base}/onboarding`;
			return;
		}
	});

	async function generateExercises() {
		if (!profile) return;
		loading = true;
		errorMessage = '';
		try {
			const systemPrompt = buildExerciseSystemPrompt(profile);
			const response = await getCompletion(
				[
					{
						role: 'system',
						content: systemPrompt,
					},
					{
						role: 'user',
						content: 'Generate 3 exercises for me. Return ONLY valid JSON.',
					},
				],
				{ maxTokens: 800, temperature: 0.8, feature: 'tutor' }
			);

			// Parse JSON from response
			const jsonMatch = response.content.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const data = JSON.parse(jsonMatch[0]);
				exercises = data.exercises || [];
			}
		} catch (error) {
			if (error instanceof AiRequestError && error.status === 429) {
				await openPaywall('block', getFeatureLabel('tutor'));
				return;
			}
			console.error('Failed to generate exercises:', error);
			errorMessage = $t('exercises.connectionError');
		} finally {
			loading = false;
		}
	}

	async function openPaywall(mode: 'nag' | 'block', feature: string) {
		paywallMode = mode;
		paywallFeature = feature;
		showPaywall = true;
		await markPaywallShown();
	}

	function checkAnswer() {
		if (!selectedAnswer) return;
		const current = exercises[currentExerciseIndex];
		isCorrect = selectedAnswer === current.correctAnswer;
		showResult = true;
	}

	function nextExercise() {
		currentExerciseIndex++;
		selectedAnswer = '';
		showResult = false;
		isCorrect = false;
	}

	let currentExercise = $derived(exercises[currentExerciseIndex]);
	let progress = $derived(currentExerciseIndex + 1);
	let total = $derived(exercises.length);
</script>

<div class="exercises-page">
	<header class="header">
		<h1>{$t('exercises.title')}</h1>
		<p class="subtitle">{$t('exercises.subtitle')}</p>
	</header>

	{#if exercises.length === 0}
		<div class="empty-state">
			<div class="illustration">
				<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
			</div>
			<h3>{$t('exercises.emptyTitle')}</h3>
			<p>{$t('exercises.emptyDescription')}</p>
			<button
				class="btn primary"
				onclick={generateExercises}
				disabled={loading}
			>
				{loading ? $t('exercises.generating') : $t('exercises.generate')}
			</button>
			{#if errorMessage}
				<div class="error-message">
					<p>{errorMessage}</p>
					<a href={`${base}/settings`} class="btn secondary">
						{$t('exercises.settingsLink')}
					</a>
				</div>
			{/if}
		</div>

	{:else}
		<div class="progress-bar">
			<div class="progress-fill" style="width: {(progress / total) * 100}%"></div>
		</div>
		<div class="progress-text">{progress} / {total}</div>

		{#if currentExercise}
			<div class="exercise-card">
				<div class="exercise-type">
					{currentExercise.type.replace('_', ' ')}
				</div>

				<h2 class="question">{currentExercise.question}</h2>

				{#if currentExercise.options}
					<div class="options">
						{#each currentExercise.options as option}
							<button
								class="option-btn"
								class:selected={selectedAnswer === option}
								class:correct={showResult && option === currentExercise.correctAnswer}
								class:incorrect={showResult && selectedAnswer === option && !isCorrect}
								onclick={() => !showResult && (selectedAnswer = option)}
							>
								{option}
							</button>
						{/each}
					</div>

				{:else}
					<input
						type="text"
						class="text-input"
						bind:value={selectedAnswer}
						disabled={showResult}
						placeholder={$t('exercises.answerPlaceholder')}
					/>
				{/if}

				{#if showResult}
					<div class="result" class:correct={isCorrect} class:incorrect={!isCorrect}>
						{#if isCorrect}
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
							<span>{$t('exercises.correct')}</span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
							<span>
								{$t('exercises.incorrect', {
									answer: Array.isArray(currentExercise.correctAnswer)
										? currentExercise.correctAnswer.join(', ')
										: currentExercise.correctAnswer
								})}
							</span>
						{/if}
					</div>

					{#if currentExercise.explanation}
						<div class="explanation">
							<strong>{$t('exercises.explanationLabel')}</strong>
							{currentExercise.explanation}
						</div>
					{/if}

					<button class="btn primary" onclick={nextExercise}>
						{progress < total ? $t('exercises.next') : $t('exercises.finish')}
					</button>
				{:else}
					<button class="btn primary" onclick={checkAnswer} disabled={!selectedAnswer}>
						{$t('exercises.answer')}
					</button>
				{/if}
			</div>
		{:else}
			<div class="completion">
				<h2>{$t('exercises.completedTitle')}</h2>
				<p>{$t('exercises.completedDescription')}</p>
				<button class="btn primary" onclick={() => { exercises = []; currentExerciseIndex = 0; }}>
					{$t('exercises.generateMore')}
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.exercises-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.header {
		text-align: center;
	}

	.header h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.subtitle {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
	}

	.illustration {
		color: var(--primary);
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		color: var(--text-secondary);
		margin-bottom: 1.5rem;
	}

	.btn {
		padding: 0.875rem 1.5rem;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.btn.primary {
		background: var(--primary);
		color: white;
	}

	.btn.primary:hover:not(:disabled) {
		background: var(--primary-dark);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.progress-bar {
		height: 6px;
		background: var(--border);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--primary);
		transition: width 0.3s;
	}

	.progress-text {
		text-align: center;
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.25rem;
	}

	.exercise-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.exercise-type {
		display: inline-block;
		background: var(--bg-secondary);
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		align-self: flex-start;
	}

	.question {
		margin: 0;
		font-size: 1.25rem;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.option-btn {
		padding: 0.875rem 1rem;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--bg);
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 1rem;
	}

	.option-btn:hover:not(:disabled) {
		border-color: var(--primary);
	}

	.option-btn.selected {
		border-color: var(--primary);
		background: #eff6ff;
	}

	.option-btn.correct {
		border-color: var(--success);
		background: #dcfce7;
	}

	.option-btn.incorrect {
		border-color: var(--error);
		background: #fee2e2;
	}

	.text-input {
		width: 100%;
		padding: 0.875rem 1rem;
		border: 2px solid var(--border);
		border-radius: 12px;
		font-size: 1rem;
		box-sizing: border-box;
	}

	.text-input:focus {
		outline: none;
		border-color: var(--primary);
	}

	.result {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: 12px;
		font-weight: 600;
	}

	.result.correct {
		background: #dcfce7;
		color: #166534;
	}

	.result.incorrect {
		background: #fee2e2;
		color: #991b1b;
	}

	.explanation {
		padding: 1rem;
		background: var(--bg-secondary);
		border-radius: 12px;
		font-size: 0.9rem;
	}

	.completion {
		text-align: center;
		padding: 2rem;
	}

	.completion h2 {
		margin: 0 0 0.5rem 0;
	}

	.completion p {
		color: var(--text-secondary);
		margin-bottom: 1.5rem;
	}

	.error-message {
		margin-top: 1.5rem;
		padding: 1rem;
		background: #fee2e2;
		border-radius: 12px;
		color: #991b1b;
	}

	.error-message p {
		margin: 0 0 1rem 0;
	}
</style>
