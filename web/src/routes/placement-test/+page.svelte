<script lang="ts">
  import { goto } from "$app/navigation";
import { base } from "$app/paths";
  import { saveUserProfile } from "$lib/storage/user-store.js";
  import type {
    UserProfile,
    EnglishLevel,
    LearningGoal,
  } from "$lib/types/user.js";
  import { getCompletion } from "$lib/ai/index.js";

  // Test configuration
  const QUESTIONS_COUNT = 5;
  let currentQuestion = $state(0);
  let userName = $state("");
  let userGoals = $state<LearningGoal[]>([]);
  let isLoading = $state(false);
  let errorMessage = $state("");

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

  const goals = [
    { value: "travel" as LearningGoal, emoji: "✈️", label: "Viajes" },
    { value: "work" as LearningGoal, emoji: "💼", label: "Trabajo" },
    { value: "study" as LearningGoal, emoji: "📚", label: "Estudios" },
    { value: "movies" as LearningGoal, emoji: "🎬", label: "Cine y Música" },
    { value: "general" as LearningGoal, emoji: "🌟", label: "General" },
  ];

  let step = $state(1); // 1: welcome, 2: name, 3: goals, 4: test, 5: results

  async function startTest() {
    step = 4;
    isLoading = true;
    errorMessage = "";

    try {
      // Generate placement questions using AI
      const prompt = `Generate ${QUESTIONS_COUNT} English placement test questions for Spanish speakers.
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

      const response = await getCompletion(
        [
          {
            role: "system",
            content:
              "You are an expert English teacher. Generate valid JSON only. Always respond in English.",
          },
          { role: "user", content: prompt },
        ],
        { maxTokens: 1000, temperature: 0.7 },
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
      console.error("Failed to generate questions, using fallback:", error);
      // Use fallback questions without error message
      questions = getFallbackQuestions();
    } finally {
      isLoading = false;
    }
  }

  function getFallbackQuestions(): Question[] {
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

  function completeOnboarding() {
    const profile: UserProfile = {
      name: userName || "Amigo",
      level: assessedLevel,
      nativeLanguage: "es",
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
    };
    saveUserProfile(profile);
    goto(`${base}/`);
  }

  function getLevelLabel(level: EnglishLevel): string {
    const labels = {
      A1: "Principiante",
      A2: "Elemental",
      B1: "Intermedio",
      B2: "Intermedio Alto",
      C1: "Avanzado",
      C2: "Proficiente",
    };
    return labels[level];
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
  {#if step === 1}
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
      <h1>¡Bienvenido a Anglicus!</h1>
      <p>
        Vamos a evaluar tu nivel de inglés con un test rápido y personalizado.
      </p>
      <p class="subtitle">El test tiene 5 preguntas y dura unos 5 minutos.</p>
      <button class="btn primary" onclick={() => (step = 2)}>Comenzar</button>
    </div>
  {:else if step === 2}
    <div class="step">
      <h2>¿Cuál es tu nombre?</h2>
      <input
        type="text"
        bind:value={userName}
        placeholder="Tu nombre"
        class="input"
        onkeydown={(e) => e.key === "Enter" && userName.trim() && (step = 3)}
      />
      <div class="actions">
        <button
          class="btn primary"
          onclick={() => (step = 3)}
          disabled={!userName.trim()}
        >
          Continuar
        </button>
      </div>
    </div>
  {:else if step === 3}
    <div class="step">
      <h2>¿Qué objetivos tienes?</h2>
      <p class="subtitle">Selecciona todos los que apliquen</p>
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
          Iniciar Test
        </button>
      </div>
    </div>
  {:else if step === 4}
    <div class="step test-step">
      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Generando test personalizado...</p>
        </div>
      {:else if errorMessage}
        <div class="error-state">
          <p>{errorMessage}</p>
          <button class="btn primary" onclick={startTest}>Reintentar</button>
        </div>
      {:else if showResults}
        <div class="step results-step">
          <div class="illustration success">
            {getLevelEmoji(assessedLevel)}
          </div>
          <h2>¡Test completado!</h2>
          <p>Tu nivel de inglés es:</p>
          <div class="level-result">
            <div class="level-code">{assessedLevel}</div>
            <div class="level-name">{getLevelLabel(assessedLevel)}</div>
          </div>

          <div class="score-summary">
            <p>
              Respuestas correctas: {answers.filter(
                (a, i) => a === questions[i]?.correctAnswer,
              ).length} / {questions.length}
            </p>
          </div>

          <button class="btn primary" onclick={completeOnboarding}>
            Comenzar a Aprender
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
            Pregunta {currentQuestion + 1} de {questions.length}
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

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
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
