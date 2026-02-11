<script lang="ts">
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import {
    saveUserProfile,
    getDefaultBilling,
  } from "$lib/storage/user-store.js";
  import { getSettings, updateSettings } from "$lib/storage/settings-store.js";
  import {
    subscribeReminders,
    type ReminderFrequency,
  } from "$lib/notifications/index.js";
  import type {
    UserProfile,
    EnglishLevel,
    LearningGoal,
    LanguageCode,
  } from "$lib/types/user.js";
  import { AiRequestError, getCompletion } from "$lib/ai/index.js";
  import {
    applyPromoToBilling,
    getFeatureLabel,
    markPaywallShown,
    validatePromoCode,
  } from "$lib/billing/index.js";
  import PaywallModal from "$lib/components/PaywallModal.svelte";
  import { locale, t } from "$lib/i18n";

  // Test configuration
  const QUESTIONS_COUNT = 5;
  let currentQuestion = $state(0);
  let userName = $state("");
  let userEmail = $state("");
  let wantsEmailReminders = $state(false);
  let userGoals = $state<LearningGoal[]>([]);
  let isLoading = $state(false);
  let errorMessage = $state("");
  let targetLanguage = $state<LanguageCode>("en");
  let uiLanguage = $derived($locale);
  let targetLabel = $derived($t(`languages.name.${targetLanguage}`));
  const targetLabelDisplay = $derived(
    uiLanguage === "es" ? targetLabel.toLowerCase() : targetLabel,
  );

  const languageOptions = $derived([
    {
      value: "en" as LanguageCode,
      label: $t("placement.languageOptions.en"),
    },
    {
      value: "es" as LanguageCode,
      label: $t("placement.languageOptions.es"),
    },
  ]);

  // Test state
  type Question = {
    question: string;
    options: string[];
    correctAnswer: string;
    difficulty: "A1" | "A2" | "B1" | "B2" | "C1";
  };

  let questions = $state<Question[]>([]);
  let answers = $state<string[]>([]);
  let showResults = $state(false);
  let assessedLevel = $state<EnglishLevel>("A1");

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DEFAULT_REMINDER_TIME = getSettings().dailyReminderTime || "20:00";
  const DEFAULT_REMINDER_FREQUENCY =
    getSettings().reminderFrequency || ("daily" as ReminderFrequency);

  function isEmailValid(value: string): boolean {
    return EMAIL_REGEX.test(value.trim());
  }

  function handleEmailInput() {
    if (!userEmail.trim() || !isEmailValid(userEmail)) {
      wantsEmailReminders = false;
    }
  }

  const goals = $derived([
    { value: "travel" as LearningGoal, emoji: "✈️", label: $t("placement.goals.travel") },
    { value: "work" as LearningGoal, emoji: "💼", label: $t("placement.goals.work") },
    { value: "study" as LearningGoal, emoji: "📚", label: $t("placement.goals.study") },
    { value: "movies" as LearningGoal, emoji: "🎬", label: $t("placement.goals.movies") },
    { value: "general" as LearningGoal, emoji: "🌟", label: $t("placement.goals.general") },
  ]);

  let step = $state(0); // 0: language, 1: welcome, 2: name, 3: promo, 4: goals, 5: test
  let promoCode = $state("");
  let promoStatus = $state<"idle" | "valid" | "invalid" | "used">("idle");
  let promoMessage = $state("");
  let promoHash = $state<string | null>(null);
  let promoSaving = $state(false);
  let showPaywall = $state(false);
  let paywallMode = $state<"nag" | "block">("block");
  let paywallFeature = $state(getFeatureLabel("tutor"));

  function getPlacementPrompt(): string {
    if (targetLanguage === "es") {
      return `Generate ${QUESTIONS_COUNT} Spanish placement test questions for English speakers.
ALL QUESTIONS MUST BE IN SPANISH ONLY.
Return ONLY a JSON object with this exact structure:
{
  "questions": [
    {
      "question": "Completa: Yo _____ a la escuela todos los dias.",
      "options": ["voy", "vas", "vamos", "van"],
      "correctAnswer": "voy",
      "difficulty": "A1"
    }
  ]
}

Include a mix of difficulties:
- 1 A1 question (basic)
- 1 A2 question (elementary)
- 1 B1 question (intermediate)
- 1 B2 question (upper intermediate)
- 1 C1 question (advanced)

Questions should test:
- Grammar (verb tenses, prepositions, articles)
- Vocabulary
- Reading comprehension

IMPORTANT: All questions and options must be in SPANISH only. No English.
Make sure the correctAnswer matches exactly one of the options.`;
    }

    return `Generate ${QUESTIONS_COUNT} English placement test questions for Spanish speakers.
ALL QUESTIONS MUST BE IN ENGLISH ONLY.
Return ONLY a JSON object with this exact structure:
{
  "questions": [
    {
      "question": "Complete: I _____ to school every day.",
      "options": ["go", "goes", "going", "went"],
      "correctAnswer": "go",
      "difficulty": "A1"
    }
  ]
}

Include a mix of difficulties:
- 1 A1 question (basic)
- 1 A2 question (elementary)
- 1 B1 question (intermediate)
- 1 B2 question (upper intermediate)
- 1 C1 question (advanced)

Questions should test:
- Grammar (verb tenses, prepositions, articles)
- Vocabulary
- Reading comprehension

IMPORTANT: All questions and options must be in ENGLISH only. No Spanish.
Make sure the correctAnswer matches exactly one of the options.`;
  }

  function getPlacementSystemPrompt(): string {
    return targetLanguage === "es"
      ? "You are an expert Spanish teacher. Generate valid JSON only. Always respond in Spanish."
      : "You are an expert English teacher. Generate valid JSON only. Always respond in English.";
  }

  async function startTest() {
    step = 5;
    isLoading = true;
    errorMessage = "";

    try {
      // Generate placement questions using AI
      const prompt = getPlacementPrompt();

      const response = await getCompletion(
        [
          {
            role: "system",
            content: getPlacementSystemPrompt(),
          },
          { role: "user", content: prompt },
        ],
        { maxTokens: 1000, temperature: 0.7, feature: "tutor" },
      );

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        questions = data.questions || [];
        // Validate we got questions
        if (questions.length === 0) {
          throw new Error("No questions generated");
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      if (error instanceof AiRequestError && error.status === 429) {
        await openPaywall("block", getFeatureLabel("tutor"));
        step = 4;
        return;
      }
      console.error("Failed to generate questions, using fallback:", error);
      // Use fallback questions without error message
      questions = getFallbackQuestions();
    } finally {
      isLoading = false;
    }
  }

  async function openPaywall(mode: "nag" | "block", feature: string) {
    paywallMode = mode;
    paywallFeature = feature;
    showPaywall = true;
    await markPaywallShown();
  }

  function getFallbackQuestions(): Question[] {
    if (targetLanguage === "es") {
      return [
        {
          question: "Completa: Yo _____ de Mexico.",
          options: ["soy", "eres", "somos", "son"],
          correctAnswer: "soy",
          difficulty: "A1",
        },
        {
          question: "Nosotros _____ estudiantes.",
          options: ["somos", "soy", "eres", "es"],
          correctAnswer: "somos",
          difficulty: "A1",
        },
        {
          question: "Ayer yo _____ al parque.",
          options: ["fui", "voy", "iba", "ire"],
          correctAnswer: "fui",
          difficulty: "A2",
        },
        {
          question: "Si _____ tiempo, viajaria mas.",
          options: ["tuviera", "tengo", "tendre", "tener"],
          correctAnswer: "tuviera",
          difficulty: "B1",
        },
        {
          question: "A pesar de _____ cansado, termine el trabajo.",
          options: ["estar", "estoy", "estuve", "estaria"],
          correctAnswer: "estar",
          difficulty: "B2",
        },
      ];
    }

    return [
      {
        question: "_____ is your name?",
        options: ["What", "When", "Where", "Who"],
        correctAnswer: "What",
        difficulty: "A1",
      },
      {
        question: "I _____ English every day.",
        options: ["study", "studies", "studying", "studied"],
        correctAnswer: "study",
        difficulty: "A1",
      },
      {
        question: "She _____ to Madrid yesterday.",
        options: ["go", "goes", "went", "going"],
        correctAnswer: "went",
        difficulty: "A2",
      },
      {
        question: "If I _____ rich, I would travel the world.",
        options: ["am", "was", "were", "be"],
        correctAnswer: "were",
        difficulty: "B1",
      },
      {
        question: "Despite _____ tired, he finished the work.",
        options: ["being", "to be", "be", "been"],
        correctAnswer: "being",
        difficulty: "B2",
      },
    ];
  }

  function selectAnswer(answer: string) {
    answers[currentQuestion] = answer;
    if (currentQuestion < questions.length - 1) {
      currentQuestion++;
    } else {
      calculateResults();
    }
  }

  function calculateResults() {
    // Count correct answers by difficulty
    const scores = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
    let correctCount = 0;

    questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) {
        scores[q.difficulty]++;
        correctCount++;
      }
    });

    // Determine level based on performance
    // If got A1 right: at least A1
    // If got A2 right: at least A2
    // etc.
    if (scores.C1 > 0) {
      assessedLevel = "C1";
    } else if (scores.B2 > 0) {
      assessedLevel = "B2";
    } else if (scores.B1 > 0) {
      assessedLevel = "B1";
    } else if (scores.A2 > 0) {
      assessedLevel = "A2";
    } else {
      assessedLevel = "A1";
    }

    // Adjust based on overall score
    if (correctCount <= 1) {
      assessedLevel = "A1";
    } else if (correctCount === 2) {
      if (assessedLevel !== "A1") assessedLevel = "A2";
    }

    showResults = true;
  }

  function toggleGoal(goal: LearningGoal) {
    if (userGoals.includes(goal)) {
      userGoals = userGoals.filter((g) => g !== goal);
    } else {
      userGoals = [...userGoals, goal];
    }
  }

  async function handleApplyPromo() {
    if (!promoCode.trim() || promoSaving) return;
    if (promoHash) {
      promoStatus = "used";
      promoMessage = $t("placement.promo.alreadyApplied");
      return;
    }
    promoSaving = true;
    promoMessage = "";
    promoStatus = "idle";

    const result = await validatePromoCode(promoCode.trim(), []);
    if (result.valid && result.codeHash) {
      promoHash = result.codeHash;
      promoStatus = "valid";
      promoMessage = $t("placement.promo.applied", {
        percent: result.discountPercent ?? 0,
      });
    } else if (result.reason === "used") {
      promoStatus = "used";
      promoMessage = $t("placement.promo.used");
    } else {
      promoStatus = "invalid";
      promoMessage = $t("placement.promo.invalid");
    }

    promoSaving = false;
  }

  async function completeOnboarding() {
    const nativeLanguage: LanguageCode = targetLanguage === "en" ? "es" : "en";
    const normalizedEmail = userEmail.trim().toLowerCase();
    let billing = getDefaultBilling();
    if (promoHash) {
      billing = await applyPromoToBilling(billing, promoHash);
    }
    const profile: UserProfile = {
      name: userName || $t("placement.defaultName"),
      email: normalizedEmail || undefined,
      level: assessedLevel,
      nativeLanguage,
      targetLanguage,
      goals: userGoals.length > 0 ? userGoals : ["general"],
      weakAreas: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      streakDays: 0,
      totalXP: 0,
      wordsLearned: 0,
      weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
      achievements: [],
      skills: [],
      billing,
    };
    await saveUserProfile(profile);

    if (normalizedEmail) {
      updateSettings({
        emailRemindersEnabled: wantsEmailReminders,
        dailyReminderTime: DEFAULT_REMINDER_TIME,
        reminderFrequency: DEFAULT_REMINDER_FREQUENCY,
      });
    }

    if (wantsEmailReminders && normalizedEmail) {
      const subscribed = await subscribeReminders({
        email: normalizedEmail,
        reminderTime: DEFAULT_REMINDER_TIME,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        frequency: DEFAULT_REMINDER_FREQUENCY,
        language: nativeLanguage,
      });

      if (!subscribed) {
        alert(
          $t("placement.reminderError"),
        );
      }
    }

    goto(`${base}/`);
  }

  function getLevelLabel(level: EnglishLevel): string {
    return $t(`placement.levels.${level}`);
  }

  function getLevelEmoji(level: EnglishLevel): string {
    const emojis = {
      A1: "🌱",
      A2: "🌿",
      B1: "🌳",
      B2: "🏔️",
      C1: "⭐",
      C2: "👑",
    };
    return emojis[level];
  }
</script>

<div class="placement-test">
  {#if step === 0}
    <div class="step">
      <h1>{$t("placement.step0.title")}</h1>
      <p class="subtitle">{$t("placement.step0.subtitle")}</p>
      <div class="language-options">
        {#each languageOptions as option}
          <button class="language-card" onclick={() => {
            targetLanguage = option.value;
            step = 1;
          }}>
            <span class="language-name">{option.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if step === 1}
    <div class="step">
      <div class="illustration">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="80"
          height="80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          <path d="M12 7v10" />
        </svg>
      </div>
      <h1>{$t("placement.step1.title")}</h1>
      <p>
        {$t("placement.step1.description", { language: targetLabelDisplay })}
      </p>
      <p class="subtitle">{$t("placement.step1.subtitle")}</p>
      <button class="btn primary" onclick={() => (step = 2)}>
        {$t("placement.step1.start")}
      </button>
    </div>
  {:else if step === 2}
    <div class="step">
      <h2>{$t("placement.step2.title")}</h2>
      <input
        type="text"
        bind:value={userName}
        placeholder={$t("placement.step2.namePlaceholder")}
        class="input"
        onkeydown={(e) =>
          e.key === "Enter" &&
          userName.trim() &&
          (!userEmail.trim() || isEmailValid(userEmail)) &&
          (step = 3)}
      />
      <input
        type="email"
        bind:value={userEmail}
        placeholder={$t("placement.step2.emailPlaceholder")}
        class="input"
        oninput={handleEmailInput}
      />
      {#if userEmail.trim() && !isEmailValid(userEmail)}
        <p class="error-text">{$t("placement.validation.emailInvalid")}</p>
      {/if}
      <label class="checkbox-row">
        <input
          type="checkbox"
          bind:checked={wantsEmailReminders}
          disabled={!userEmail.trim() || !isEmailValid(userEmail)}
        />
        <span>{$t("placement.step2.emailOptIn")}</span>
      </label>
      <p class="consent-note">
        {@html $t("placement.step2.consent", {
          link: `<a href="${base}/legal#privacy">${$t("placement.step2.consentLink")}</a>`,
        })}
      </p>
      <div class="actions">
        <button
          class="btn primary"
          onclick={() => (step = 3)}
          disabled={!userName.trim() || (!!userEmail.trim() && !isEmailValid(userEmail))}
        >
          {$t("common.continue")}
        </button>
      </div>
    </div>
  {:else if step === 3}
    <div class="step">
      <h2>{$t("placement.step3.title")}</h2>
      <p class="subtitle">{$t("placement.step3.subtitle")}</p>
      <input
        type="text"
        bind:value={promoCode}
        placeholder={$t("placement.step3.placeholder")}
        class="input"
        onkeydown={(e) => e.key === "Enter" && handleApplyPromo()}
      />
      {#if promoMessage}
        <p class={`promo-message ${promoStatus}`}>{promoMessage}</p>
      {/if}
      <div class="actions">
        <button
          class="btn secondary"
          onclick={handleApplyPromo}
          disabled={!promoCode.trim() || promoSaving}
        >
          {promoSaving ? $t("placement.step3.validating") : $t("placement.step3.apply")}
        </button>
        <button class="btn primary" onclick={() => (step = 4)}>
          {$t("common.continue")}
        </button>
      </div>
    </div>
  {:else if step === 4}
    <div class="step">
      <h2>{$t("placement.step4.title")}</h2>
      <p class="subtitle">{$t("placement.step4.subtitle")}</p>
      <div class="goals">
        {#each goals as goal}
          <button
            class="goal-card"
            class:selected={userGoals.includes(goal.value)}
            onclick={() => toggleGoal(goal.value)}
          >
            <span class="goal-emoji">{goal.emoji}</span>
            <span class="goal-label">{goal.label}</span>
          </button>
        {/each}
      </div>
      <div class="actions">
        <button
          class="btn primary"
          onclick={startTest}
          disabled={userGoals.length === 0}
        >
          {$t("placement.step4.startTest")}
        </button>
      </div>
    </div>
  {:else if step === 5}
    <div class="step test-step">
      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>{$t("placement.step5.generating")}</p>
        </div>
      {:else if errorMessage}
        <div class="error-state">
          <p>{errorMessage}</p>
          <button class="btn primary" onclick={startTest}>
            {$t("common.retry")}
          </button>
        </div>
      {:else if showResults}
        <div class="step results-step">
          <div class="illustration success">
            {getLevelEmoji(assessedLevel)}
          </div>
          <h2>{$t("placement.results.title")}</h2>
          <p>
            {$t("placement.results.levelLabel", { language: targetLabelDisplay })}
          </p>
          <div class="level-result">
            <div class="level-code">{assessedLevel}</div>
            <div class="level-name">{getLevelLabel(assessedLevel)}</div>
          </div>

          <div class="score-summary">
            <p>
              {$t("placement.results.correctAnswers", {
                correct: answers.filter((a, i) => a === questions[i]?.correctAnswer)
                  .length,
                total: questions.length,
              })}
            </p>
          </div>

          <button class="btn primary" onclick={completeOnboarding}>
            {$t("placement.results.startLearning")}
          </button>
        </div>
      {:else}
        <div class="progress-header">
          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width: {((currentQuestion + 1) / questions.length) * 100}%"
            ></div>
          </div>
          <p class="question-number">
            {$t("placement.step5.questionProgress", {
              current: currentQuestion + 1,
              total: questions.length,
            })}
          </p>
        </div>

        {#if questions[currentQuestion]}
          <div class="question-card">
            <div class="difficulty-badge">
              {questions[currentQuestion].difficulty}
            </div>
            <h2 class="question-text">{questions[currentQuestion].question}</h2>

            <div class="options">
              {#each questions[currentQuestion].options as option}
                <button
                  class="option-btn"
                  class:selected={answers[currentQuestion] === option}
                  onclick={() => selectAnswer(option)}
                >
                  {option}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
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
  .placement-test {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .step {
    max-width: 500px;
    width: 100%;
    text-align: center;
  }

  .step h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  .step h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }

  .step p {
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .subtitle {
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }

  .illustration {
    margin: 2rem auto;
    color: var(--primary);
  }

  .illustration.success {
    font-size: 4rem;
    margin: 1rem auto;
  }

  .input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 1rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    margin-bottom: 1.5rem;
    box-sizing: border-box;
  }

  .input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .error-text {
    margin: -1rem 0 1rem;
    font-size: 0.8rem;
    color: #fca5a5;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
  }

  .consent-note {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 1.5rem;
  }

  :global(.consent-note a) {
    color: var(--primary-light);
  }

  .language-options {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .language-card {
    padding: 1rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    cursor: pointer;
    transition: all 0.2s;
  }

  .language-card:hover {
    border-color: var(--primary);
  }

  .language-name {
    font-weight: 600;
  }

  .goals {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .goal-card {
    padding: 1rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .goal-card:hover {
    border-color: var(--primary);
  }

  .goal-card.selected {
    border-color: var(--primary);
    background: #eff6ff;
    color: #1f2937;
  }

  .goal-card.selected .goal-label {
    color: #1f2937;
  }

  .goal-emoji {
    font-size: 2rem;
  }

  .goal-label {
    font-weight: 500;
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

  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.secondary {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.35);
  }

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .promo-message {
    margin: -1rem 0 1rem;
    font-size: 0.85rem;
  }

  .promo-message.valid {
    color: #86efac;
  }

  .promo-message.invalid,
  .promo-message.used {
    color: #fca5a5;
  }

  /* Test step styles */
  .test-step {
    max-width: 600px;
  }

  .loading-state,
  .error-state {
    text-align: center;
    padding: 3rem;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .progress-header {
    margin-bottom: 1.5rem;
  }

  .progress-bar {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s;
  }

  .question-number {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .question-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.5rem;
    text-align: left;
  }

  .difficulty-badge {
    display: inline-block;
    background: var(--bg-secondary);
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .question-text {
    margin: 0 0 1.5rem 0;
    font-size: 1.25rem;
    line-height: 1.4;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .option-btn {
    padding: 1rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 1rem;
  }

  .option-btn:hover {
    border-color: var(--primary);
  }

  .option-btn.selected {
    border-color: var(--primary);
    background: #eff6ff;
    color: #1f2937;
  }

  /* Results styles */
  .results-step {
    max-width: 450px;
  }

  .level-result {
    margin: 1.5rem 0;
    padding: 1.5rem;
    background: #eff6ff;
    border-radius: 16px;
    color: #1f2937;
  }

  .level-code {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--primary);
  }

  .level-name {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 0.5rem;
  }

  .score-summary {
    margin-bottom: 1.5rem;
    color: var(--text-secondary);
  }
</style>
