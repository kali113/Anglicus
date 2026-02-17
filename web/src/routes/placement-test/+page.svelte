<script lang="ts">
import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import {
    getUserProfile,
    saveUserProfile,
    getDefaultBilling,
    getDefaultSpeaking,
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
    applyReferralToBilling,
    applyPromoToBilling,
    getFeatureLabel,
    markPaywallShown,
    validateReferralCode,
    validatePromoCode,
  } from "$lib/billing/index.js";
  import { trackEvent } from "$lib/analytics/index.js";
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
      label: "English",
      subtitle: "para hablantes de español",
    },
    {
      value: "es" as LanguageCode,
      label: "Español",
      subtitle: "for English speakers",
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
  let referralHash = $state<string | null>(null);
  let referralDiscountPercent = $state(25);
  let referralMessage = $state("");
  let showPaywall = $state(false);
  let paywallMode = $state<"nag" | "block">("block");
  let paywallFeature = $state(getFeatureLabel("tutor"));

  onMount(async () => {
    const existingProfile = await getUserProfile();
    if (existingProfile) {
      const existingName = existingProfile.name?.trim() || "";
      userName = existingName.toLowerCase() === "learner" ? "" : existingName;
      userEmail = existingProfile.email || "";
      targetLanguage = existingProfile.targetLanguage || targetLanguage;
    }

    const params = new URL(window.location.href).searchParams;
    if (params.get("step") === "name") {
      step = 2;
    }
  });

  function localized(en: string, es: string): string {
    return uiLanguage === "es" ? es : en;
  }

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
    if (referralHash) {
      promoStatus = "used";
      promoMessage =
        localized(
          "Referral discount already active. Promo codes do not stack.",
          "El descuento por referido ya está activo. Los códigos promo no se acumulan.",
        );
      return;
    }
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
    if (referralHash) {
      billing = await applyReferralToBilling(
        billing,
        referralHash,
        referralDiscountPercent,
      );
    } else if (promoHash) {
      billing = await applyPromoToBilling(billing, promoHash);
    }
    const profile: UserProfile = {
      schemaVersion: 2,
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
      speaking: getDefaultSpeaking(),
      billing,
    };
    await saveUserProfile(profile);
    void trackEvent("onboarding_completed", {
      level: assessedLevel,
      targetLanguage,
      hasEmail: Boolean(normalizedEmail),
    });

    let emailRemindersEnabled = false;
    if (wantsEmailReminders && normalizedEmail) {
      const subscribed = await subscribeReminders({
        email: normalizedEmail,
        reminderTime: DEFAULT_REMINDER_TIME,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        frequency: DEFAULT_REMINDER_FREQUENCY,
        language: nativeLanguage,
      });

      if (!subscribed) {
        alert($t("placement.reminderError"));
      } else {
        emailRemindersEnabled = true;
        void trackEvent("reminder_enabled", { channel: "email" });
      }
    }

    if (normalizedEmail) {
      updateSettings({
        emailRemindersEnabled,
        dailyReminderTime: DEFAULT_REMINDER_TIME,
        reminderFrequency: DEFAULT_REMINDER_FREQUENCY,
      });
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

<div class="placement-test" class:locale-es={uiLanguage === "es"} class:locale-en={uiLanguage !== "es"}>
  {#if step === 0}
    <div class="step">
      <h1>
        <span class="lang-en">Which language do you want to learn?</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">¿Qué idioma quieres aprender?</span>
      </h1>
      <p class="subtitle">
        <span class="lang-en">Choose your learning goal</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">Elige tu objetivo de aprendizaje</span>
      </p>
      <div class="language-options">
        {#each languageOptions as option}
          <button class="language-card" onclick={() => {
            targetLanguage = option.value;
            step = 1;
          }}>
            <span class="language-name">{option.label}</span>
            <span class="language-subtitle">{option.subtitle}</span>
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
      <h1>
        <span class="lang-en">Welcome to Anglicus!</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">¡Bienvenido a Anglicus!</span>
      </h1>
      <p>
        <span class="lang-en">We'll assess your {targetLabelDisplay} level with a quick, personalized test.</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">Vamos a evaluar tu nivel de {targetLabelDisplay} con un test rápido y personalizado.</span>
      </p>
      <p class="subtitle">
        <span class="lang-en">The test has 5 questions and takes about 5 minutes.</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">El test tiene 5 preguntas y dura unos 5 minutos.</span>
      </p>
      <button class="btn primary" onclick={() => (step = 2)}>
        <span class="lang-en">Start</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">Comenzar</span>
      </button>
    </div>
  {:else if step === 2}
    <div class="step">
      <h2>
        <span class="lang-en">What's your name?</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">¿Cuál es tu nombre?</span>
      </h2>
      <input
        type="text"
        bind:value={userName}
        placeholder={localized("Your name", "Tu nombre")}
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
        placeholder={localized("Your email (optional)", "Tu email (opcional)")}
        class="input"
        oninput={handleEmailInput}
      />
      {#if userEmail.trim() && !isEmailValid(userEmail)}
        <p class="error-text">
          <span class="lang-en">Invalid email.</span>
          <span class="lang-divider"> / </span>
          <span class="lang-es">Email inválido.</span>
        </p>
      {/if}
      <label class="checkbox-row">
        <input
          type="checkbox"
          bind:checked={wantsEmailReminders}
          disabled={!userEmail.trim() || !isEmailValid(userEmail)}
        />
        <span>
          <span class="lang-en">I want to receive email reminders.</span>
          <span class="lang-divider"> / </span>
          <span class="lang-es">Quiero recibir recordatorios por email.</span>
        </span>
      </label>
      <p class="consent-note">
        <span class="lang-en">Optional. You can unsubscribe in Settings. See the <a href="{base}/legal#privacy">Privacy policy</a>.</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">Opcional. Puedes darte de baja en Configuración. Consulta la <a href="{base}/legal#privacy">Política de privacidad</a>.</span>
      </p>
      <div class="actions identity-actions">
        <a class="google-shortcut" href="{base}/login">
          <img class="google-icon" src="{base}/google-logo.svg" alt="" />
          <span>{$t("auth.googleButton")}</span>
        </a>
        <button
          class="btn primary"
          onclick={() => (step = 3)}
          disabled={!userName.trim() || (!!userEmail.trim() && !isEmailValid(userEmail))}
        >
          <span class="lang-en">Continue</span>
          <span class="lang-divider"> / </span>
          <span class="lang-es">Continuar</span>
        </button>
      </div>
    </div>
  {:else if step === 3}
    <div class="step">
      <h2>
        <span class="lang-en">Do you have a code?</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">¿Tienes un código?</span>
      </h2>
      <p class="subtitle">
        <span class="lang-en">Optional. Use it to unlock a Pro discount.</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">Opcional. Úsalo para activar un descuento Pro.</span>
      </p>
      {#if referralMessage}
        <p class={`promo-message ${referralHash ? "valid" : "invalid"}`}>{referralMessage}</p>
      {/if}
      <input
        type="text"
        bind:value={promoCode}
        placeholder="ABCDEFGH"
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
          {promoSaving ? localized("Validating...", "Validando...") : localized("Apply", "Aplicar")}
        </button>
        <button class="btn primary" onclick={() => (step = 4)}>
          <span class="lang-en">Continue</span>
          <span class="lang-divider"> / </span>
          <span class="lang-es">Continuar</span>
        </button>
      </div>
    </div>
  {:else if step === 4}
    <div class="step">
      <h2>
        <span class="lang-en">What are your goals?</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">¿Qué objetivos tienes?</span>
      </h2>
      <p class="subtitle">
        <span class="lang-en">Select all that apply</span>
        <span class="lang-divider"> / </span>
        <span class="lang-es">Selecciona todos los que apliquen</span>
      </p>
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
          <span class="lang-en">Start Test</span>
          <span class="lang-divider"> / </span>
          <span class="lang-es">Iniciar Test</span>
        </button>
      </div>
    </div>
  {:else if step === 5}
    <div class="step test-step">
      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>
            <span class="lang-en">Generating personalized test...</span>
            <span class="lang-divider"> / </span>
            <span class="lang-es">Generando test personalizado...</span>
          </p>
        </div>
      {:else if errorMessage}
        <div class="error-state">
          <p>{errorMessage}</p>
          <button class="btn primary" onclick={startTest}>
            <span class="lang-en">Retry</span>
            <span class="lang-divider"> / </span>
            <span class="lang-es">Reintentar</span>
          </button>
        </div>
      {:else if showResults}
        <div class="step results-step">
          <div class="illustration success">
            {getLevelEmoji(assessedLevel)}
          </div>
          <h2>
            <span class="lang-en">Test completed!</span>
            <span class="lang-divider"> / </span>
            <span class="lang-es">¡Test completado!</span>
          </h2>
          <p>
            <span class="lang-en">Your {targetLabelDisplay} level is:</span>
            <span class="lang-divider"> / </span>
            <span class="lang-es">Tu nivel de {targetLabelDisplay} es:</span>
          </p>
          <div class="level-result">
            <div class="level-code">{assessedLevel}</div>
            <div class="level-name">{getLevelLabel(assessedLevel)}</div>
          </div>

          <div class="score-summary">
            <p>
              <span class="lang-en">Correct answers: {answers.filter((a, i) => a === questions[i]?.correctAnswer).length} / {questions.length}</span>
              <span class="lang-divider"> / </span>
              <span class="lang-es">Respuestas correctas: {answers.filter((a, i) => a === questions[i]?.correctAnswer).length} / {questions.length}</span>
            </p>
          </div>

          <div class="conversion-panel">
            <p>
              <span class="lang-en">✅ Your personalized path is now ready.</span>
              <span class="lang-divider"> / </span>
              <span class="lang-es">✅ Tu ruta personalizada ya está lista.</span>
            </p>
            <p>
              <span class="lang-en">✅ Start free now and unlock Pro anytime for unlimited tutor access.</span>
              <span class="lang-divider"> / </span>
              <span class="lang-es">✅ Empieza gratis ahora y desbloquea Pro cuando quieras para tutor ilimitado.</span>
            </p>
          </div>

          <button class="btn primary" onclick={completeOnboarding}>
            <span class="lang-en">Start Learning Now</span>
            <span class="lang-divider"> / </span>
            <span class="lang-es">Empezar a Aprender Ahora</span>
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
            <span class="lang-en">Question {currentQuestion + 1} of {questions.length}</span>
            <span class="lang-divider"> / </span>
            <span class="lang-es">Pregunta {currentQuestion + 1} de {questions.length}</span>
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
    --onboarding-text-primary: var(--text, #f3f4f6);
    --onboarding-text-secondary: var(--text-secondary, #cbd5e1);
    --onboarding-text-muted: var(--text-muted, #94a3b8);
    color: var(--onboarding-text-primary);
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
    color: var(--onboarding-text-primary);
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  .step h2 {
    color: var(--onboarding-text-primary);
    font-size: 1.5rem;
    margin-bottom: 1rem;
  }

  .step p {
    color: var(--onboarding-text-primary);
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: var(--onboarding-text-secondary);
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
    color: var(--onboarding-text-primary);
    background: color-mix(in srgb, var(--bg-card, #1f2937) 92%, white 8%);
    border: 2px solid var(--border);
    border-radius: 12px;
    margin-bottom: 1.5rem;
    box-sizing: border-box;
  }

  .input::placeholder {
    color: var(--onboarding-text-muted);
  }

  .input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .input:-webkit-autofill,
  .input:-webkit-autofill:hover,
  .input:-webkit-autofill:focus {
    -webkit-text-fill-color: var(--onboarding-text-primary);
    caret-color: var(--onboarding-text-primary);
    box-shadow: inset 0 0 0 1000px color-mix(in srgb, var(--bg-card, #1f2937) 92%, white 8%);
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
    color: var(--onboarding-text-secondary);
    margin-bottom: 0.5rem;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
  }

  .consent-note {
    font-size: 0.75rem;
    color: var(--onboarding-text-muted);
    margin-bottom: 1.5rem;
  }

  :global(.consent-note a) {
    color: var(--primary-light);
  }

  .google-shortcut {
    width: 100%;
    max-width: 360px;
    min-height: 42px;
    border-radius: 999px;
    border: 1px solid #dadce0;
    background: #fff;
    color: #3c4043;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.55rem 1rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
    text-decoration: none;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .google-shortcut:hover {
    background: #f8f9fa;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .google-shortcut:active {
    background: #f1f3f4;
  }

  .google-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
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
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .language-card:hover {
    border-color: var(--primary);
  }

  .language-name {
    color: var(--onboarding-text-primary);
    font-weight: 600;
  }

  .language-subtitle {
    font-size: 0.875rem;
    color: var(--onboarding-text-secondary);
    margin-top: 0.25rem;
  }

  .lang-en {
    color: var(--onboarding-text-primary);
  }

  .lang-es {
    color: var(--onboarding-text-primary);
  }

  .lang-divider {
    color: var(--onboarding-text-muted);
    margin: 0 0.5rem;
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
    color: var(--onboarding-text-primary);
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
    background: rgba(148, 163, 184, 0.15);
    border: 1px solid rgba(148, 163, 184, 0.45);
    color: var(--onboarding-text-primary);
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.3);
  }

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .identity-actions {
    flex-direction: column;
    align-items: center;
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
    color: var(--onboarding-text-secondary);
    margin: 0;
  }

  .question-card {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--onboarding-text-primary);
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
    color: var(--onboarding-text-primary);
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
    color: var(--onboarding-text-secondary);
  }

  .conversion-panel {
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.75rem 1rem;
    background: rgba(45, 212, 191, 0.06);
    margin-bottom: 1rem;
  }

  .conversion-panel p {
    margin: 0.35rem 0;
    font-size: 0.9rem;
  }
</style>
