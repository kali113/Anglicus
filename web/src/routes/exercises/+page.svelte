<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { getUserProfile } from '$lib/storage/user-store.js';
	import {
		AiRequestError,
		getCompletion,
		buildExerciseSystemPrompt,
		shouldRedirectToLoginBeforeAiRequest,
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
	let fillBlankAnswers = $state<string[]>([]);
	let activeFillBlankIndex = $state(0);
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
		if (await shouldRedirectToLoginBeforeAiRequest()) {
			window.location.href = `${base}/login`;
			return;
		}
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
				currentExerciseIndex = 0;
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

	function normalizeAnswer(value: string): string {
		return value.trim().toLowerCase().replace(/\s+/g, ' ');
	}

	function countQuestionGaps(question: string): number {
		return question.match(/_{3,}/g)?.length ?? 0;
	}

	function parseFillBlankCorrectAnswers(exercise: Exercise): string[] {
		if (Array.isArray(exercise.correctAnswer)) {
			return exercise.correctAnswer;
		}
		const gapCount = countQuestionGaps(exercise.question);
		if (gapCount <= 1) {
			return [exercise.correctAnswer];
		}
		const splitAnswer = exercise.correctAnswer
			.split(/[|,]/)
			.map((item) => item.trim())
			.filter(Boolean);
		return splitAnswer.length === gapCount ? splitAnswer : [exercise.correctAnswer];
	}

	function getOptionMatchCount(values: string[], target: string): number {
		const normalizedTarget = normalizeAnswer(target);
		return values.filter((value) => normalizeAnswer(value) === normalizedTarget).length;
	}

	function getCorrectAnswerForResult(exercise: Exercise): string {
		if (exercise.type === 'fill_blank') {
			return parseFillBlankCorrectAnswers(exercise).join(', ');
		}
		return Array.isArray(exercise.correctAnswer)
			? exercise.correctAnswer.join(', ')
			: exercise.correctAnswer;
	}

	function isOptionCorrect(option: string, exercise: Exercise): boolean {
		if (Array.isArray(exercise.correctAnswer)) {
			return exercise.correctAnswer.some(
				(answer) => normalizeAnswer(answer) === normalizeAnswer(option)
			);
		}
		return normalizeAnswer(exercise.correctAnswer) === normalizeAnswer(option);
	}

	function getFillBlankOptionLimit(option: string): number {
		if (!currentExercise?.options) return 0;
		return getOptionMatchCount(currentExercise.options, option);
	}

	function getFillBlankOptionUsage(option: string): number {
		return getOptionMatchCount(
			fillBlankAnswers.filter((answer) => answer.trim().length > 0),
			option
		);
	}

	function isFillBlankOptionUsed(option: string): boolean {
		return getFillBlankOptionUsage(option) > 0;
	}

	function isFillBlankOptionDisabled(option: string): boolean {
		if (!isFillBlankWordBank || showResult) return true;

		let targetIndex = activeFillBlankIndex;
		if (targetIndex < 0 || targetIndex >= fillBlankAnswers.length) {
			targetIndex = fillBlankAnswers.findIndex((answer) => !answer);
		}

		const targetValue = targetIndex >= 0 ? fillBlankAnswers[targetIndex] : '';
		const optionLimit = getFillBlankOptionLimit(option);
		const optionUsage = getFillBlankOptionUsage(option);
		const targetUsesSameOption =
			targetValue.length > 0 && normalizeAnswer(targetValue) === normalizeAnswer(option);

		if (targetUsesSameOption) {
			return optionUsage > optionLimit;
		}
		return optionUsage >= optionLimit;
	}

	function focusFillBlank(index: number) {
		if (!isFillBlankWordBank || showResult) return;
		if (activeFillBlankIndex === index && fillBlankAnswers[index]) {
			fillBlankAnswers = fillBlankAnswers.map((answer, answerIndex) =>
				answerIndex === index ? '' : answer
			);
			return;
		}
		activeFillBlankIndex = index;
	}

	function selectFillBlankOption(option: string) {
		if (!isFillBlankWordBank || showResult) return;

		let targetIndex = activeFillBlankIndex;
		if (targetIndex < 0 || targetIndex >= fillBlankAnswers.length) {
			targetIndex = fillBlankAnswers.findIndex((answer) => !answer);
		}
		if (targetIndex === -1) {
			targetIndex = 0;
		}

		const previousValue = fillBlankAnswers[targetIndex];
		const selectingSameOption =
			previousValue.length > 0 && normalizeAnswer(previousValue) === normalizeAnswer(option);
		if (!selectingSameOption && isFillBlankOptionDisabled(option)) {
			return;
		}

		const updatedAnswers = fillBlankAnswers.map((answer, index) =>
			index === targetIndex ? option : answer
		);
		fillBlankAnswers = updatedAnswers;
		const nextEmptyIndex = updatedAnswers.findIndex((answer) => !answer);
		activeFillBlankIndex = nextEmptyIndex === -1 ? targetIndex : nextEmptyIndex;
	}

	async function openPaywall(mode: 'nag' | 'block', feature: string) {
		paywallMode = mode;
		paywallFeature = feature;
		showPaywall = true;
		await markPaywallShown();
	}

	function checkAnswer() {
		const current = exercises[currentExerciseIndex];
		if (!current) return;

		if (isFillBlankWordBank) {
			if (!canSubmit) return;
			const expectedAnswers = parseFillBlankCorrectAnswers(current);
			isCorrect =
				expectedAnswers.length === fillBlankAnswers.length &&
				expectedAnswers.every(
					(answer, index) =>
						normalizeAnswer(answer) === normalizeAnswer(fillBlankAnswers[index] ?? '')
				);
			showResult = true;
			return;
		}

		if (!selectedAnswer.trim()) return;
		isCorrect =
			normalizeAnswer(selectedAnswer) ===
			normalizeAnswer(
				Array.isArray(current.correctAnswer)
					? current.correctAnswer.join(' ')
					: current.correctAnswer
			);
		showResult = true;
	}

	function nextExercise() {
		currentExerciseIndex++;
	}

	let currentExercise = $derived(exercises[currentExerciseIndex]);
	let fillBlankParts = $derived(
		currentExercise?.type === 'fill_blank' ? currentExercise.question.split(/_{3,}/g) : []
	);
	let fillBlankCount = $derived(Math.max(fillBlankParts.length - 1, 0));
	let isFillBlankWordBank = $derived(
		currentExercise?.type === 'fill_blank' &&
			fillBlankCount > 0 &&
			Array.isArray(currentExercise.options) &&
			currentExercise.options.length > 0
	);
	let canSubmit = $derived(
		currentExercise
			? isFillBlankWordBank
				? fillBlankAnswers.length === fillBlankCount &&
					fillBlankAnswers.every((answer) => answer.trim().length > 0)
				: selectedAnswer.trim().length > 0
			: false
	);
	let progress = $derived(currentExerciseIndex + 1);
	let total = $derived(exercises.length);

	$effect(() => {
		if (!currentExercise) return;
		selectedAnswer = '';
		showResult = false;
		isCorrect = false;
		if (isFillBlankWordBank) {
			fillBlankAnswers = Array.from({ length: fillBlankCount }, () => '');
			activeFillBlankIndex = 0;
			return;
		}
		fillBlankAnswers = [];
		activeFillBlankIndex = 0;
	});
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

					{#if isFillBlankWordBank}
						<div class="gap-card">
							<h2 class="question">{currentExercise.question}</h2>
							<div class="gap-sentence">
								{#each fillBlankParts as part, index}
									<span>{part}</span>
									{#if index < fillBlankCount}
										<button
											type="button"
											class="gap-slot"
											class:active={activeFillBlankIndex === index && !showResult}
											class:filled={fillBlankAnswers[index]?.trim().length > 0}
											onclick={() => focusFillBlank(index)}
											disabled={showResult}
										>
											{fillBlankAnswers[index] || '_____'}
										</button>
									{/if}
								{/each}
							</div>
						</div>

						<p class="gap-hint">{$t('exercises.fillBlankHint')}</p>

						<div class="gap-options">
							{#each currentExercise.options ?? [] as option}
								<button
									type="button"
									class="gap-option"
									class:used={isFillBlankOptionUsed(option)}
									onclick={() => selectFillBlankOption(option)}
									disabled={isFillBlankOptionDisabled(option)}
								>
									{option}
								</button>
							{/each}
						</div>
					{:else}
						<h2 class="question">{currentExercise.question}</h2>

						{#if currentExercise.options}
							<div class="options">
								{#each currentExercise.options as option}
									<button
										class="option-btn"
										class:selected={selectedAnswer === option}
										class:correct={showResult && isOptionCorrect(option, currentExercise)}
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
										answer: getCorrectAnswerForResult(currentExercise)
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
						<button class="btn primary" onclick={checkAnswer} disabled={!canSubmit}>
							{isFillBlankWordBank ? $t('exercises.check') : $t('exercises.answer')}
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

<PaywallModal
	open={showPaywall}
	mode={paywallMode}
	featureLabel={paywallFeature}
	onclose={() => (showPaywall = false)}
	onpaid={() => (showPaywall = false)}
/>

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

	.gap-card {
		background: linear-gradient(145deg, #111827, #0f172a);
		border: 1px solid #1f2937;
		border-radius: 14px;
		padding: 1rem;
	}

	.gap-card .question {
		font-size: 1rem;
		color: #cbd5e1;
		margin-bottom: 0.75rem;
	}

	.gap-sentence {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		color: #f8fafc;
		line-height: 1.7;
		font-size: 1.1rem;
	}

	.gap-slot {
		border: 1px solid #334155;
		border-radius: 999px;
		background: #0b1120;
		color: #e2e8f0;
		padding: 0.35rem 0.8rem;
		font-size: 0.95rem;
		font-weight: 600;
		min-width: 5.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.gap-slot.active {
		border-color: #60a5fa;
		box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
	}

	.gap-slot.filled {
		background: #1e293b;
		border-color: #475569;
	}

	.gap-slot:disabled {
		opacity: 0.8;
		cursor: default;
	}

	.gap-hint {
		margin: -0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.gap-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.gap-option {
		padding: 0.7rem 0.9rem;
		border: 1px solid #334155;
		border-radius: 999px;
		background: #111827;
		color: #e2e8f0;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.gap-option:hover:not(:disabled) {
		transform: translateY(-1px);
		border-color: #60a5fa;
		background: #172033;
	}

	.gap-option.used {
		background: #1e293b;
	}

	.gap-option:disabled {
		opacity: 0.45;
		cursor: not-allowed;
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

	@media (max-width: 420px) {
		.gap-options {
			grid-template-columns: 1fr;
		}
	}
</style>
