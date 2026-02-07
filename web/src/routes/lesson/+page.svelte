<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
import { base } from "$app/paths";
  import {
    addXp,
    incrementWordsLearned,
    updateWeeklyActivity,
    unlockAchievement,
  } from "$lib/storage/user-store";
  import { streamCompletion } from "$lib/ai/client";

  interface Word {
    id: string;
    text: string;
    selected: boolean;
  }

  interface Exercise {
    id: number;
    original: string;
    target: string[];
    wordBank: string[];
  }

  // All exercises for this lesson
  const exercises: Exercise[] = [
    {
      id: 1,
      original: "Hola, me llamo...",
      target: ["Hello", "my", "name", "is"],
      wordBank: ["Hello", "name", "is", "my", "nice", "meet"],
    },
    {
      id: 2,
      original: "¿Cómo estás?",
      target: ["How", "are", "you"],
      wordBank: ["How", "you", "are", "what", "is", "doing"],
    },
    {
      id: 3,
      original: "Mucho gusto",
      target: ["Nice", "to", "meet", "you"],
      wordBank: ["Nice", "meet", "to", "you", "hello", "good"],
    },
    {
      id: 4,
      original: "Buenos días",
      target: ["Good", "morning"],
      wordBank: ["Good", "morning", "night", "hello", "day"],
    },
    {
      id: 5,
      original: "¿De dónde eres?",
      target: ["Where", "are", "you", "from"],
      wordBank: ["Where", "you", "are", "from", "what", "come"],
    },
    {
      id: 6,
      original: "Soy de España",
      target: ["I", "am", "from", "Spain"],
      wordBank: ["I", "am", "from", "Spain", "is", "come"],
    },
    {
      id: 7,
      original: "¿Cuál es tu nombre?",
      target: ["What", "is", "your", "name"],
      wordBank: ["What", "is", "your", "name", "who", "are"],
    },
  ];

  let currentExerciseIndex = $state(0);
  let currentExercise = $derived(exercises[currentExerciseIndex]);
  let progress = $derived((currentExerciseIndex / exercises.length) * 100);
  let lessonComplete = $state(false);
  let totalXpEarned = $state(0);

  // Explanation state
  let explanation = $state("");
  let isExplaining = $state(false);

  // Ask tutor state
  let tutorQuestion = $state("");
  let tutorResponse = $state("");
  let isAskingTutor = $state(false);
  let showTutorBox = $state(false);

  // Word state - reset for each exercise
  let availableWords = $state<Word[]>([]);
  let selectedWords = $state<Word[]>([]);
  let isCorrect = $state<boolean | null>(null);

  function initExercise() {
    availableWords = currentExercise.wordBank.map((text, i) => ({
      id: `${currentExercise.id}-${i}`,
      text,
      selected: false,
    }));
    selectedWords = [];
    isCorrect = null;
    explanation = "";
    tutorResponse = "";
    showTutorBox = false;
  }

  // Initialize first exercise
  $effect(() => {
    if (currentExercise) {
      initExercise();
    }
  });

  function toggleWord(word: Word) {
    if (isCorrect === true) return;

    if (isCorrect === false) {
      isCorrect = null;
      explanation = "";
      showTutorBox = false;
      tutorResponse = "";
    }

    if (selectedWords.find((w) => w.id === word.id)) {
      selectedWords = selectedWords.filter((w) => w.id !== word.id);
      const w = availableWords.find((w) => w.id === word.id);
      if (w) w.selected = false;
    } else {
      selectedWords = [...selectedWords, word];
      const w = availableWords.find((w) => w.id === word.id);
      if (w) w.selected = true;
    }
  }

  async function checkAnswer() {
    const constructedSentence = selectedWords.map((w) => w.text).join(" ");
    const correctSentence = currentExercise.target.join(" ");

    isCorrect = constructedSentence === correctSentence;

    if (isCorrect) {
      const xpGain = 15;
      totalXpEarned += xpGain;
      addXp(xpGain);
      incrementWordsLearned(currentExercise.target.length);
      updateWeeklyActivity(1);
    } else {
      explanation = "";
      isExplaining = true;
      showTutorBox = true;

      const messages = [
        {
          role: "system" as const,
          content:
            "You are a helpful English tutor. Explain briefly (2-3 sentences) why the user's translation is wrong. Focus on grammar or word order. Be encouraging.",
        },
        {
          role: "user" as const,
          content: `Original: "${currentExercise.original}"\nTarget: "${correctSentence}"\nUser Wrote: "${constructedSentence}"\nExplain the mistake.`,
        },
      ];

      try {
        await streamCompletion(messages, (chunk) => {
          explanation += chunk;
        });
      } catch (err) {
        explanation =
          "The correct answer is: " +
          correctSentence +
          ". Try to match the word order exactly!";
        console.error("Explanation error:", err);
      } finally {
        isExplaining = false;
      }
    }
  }

  function nextExercise() {
    if (currentExerciseIndex < exercises.length - 1) {
      currentExerciseIndex++;
    } else {
      lessonComplete = true;
      unlockAchievement("early_bird");
    }
  }

  async function askTutor() {
    if (!tutorQuestion.trim() || isAskingTutor) return;

    isAskingTutor = true;
    tutorResponse = "";

    const userAttempt = selectedWords.map((w) => w.text).join(" ");
    const target = currentExercise.target.join(" ");

    const messages = [
      {
        role: "system" as const,
        content:
          "You are a friendly English tutor named Anglicus. Answer the student's question about this translation exercise. Be helpful, encouraging, and explain concepts clearly. Keep responses concise (2-4 sentences).",
      },
      {
        role: "user" as const,
        content: `Context: Translating "${currentExercise.original}" to English.
Correct answer: "${target}"
Student's attempt: "${userAttempt}"
Student's question: "${tutorQuestion}"`,
      },
    ];

    try {
      await streamCompletion(messages, (chunk) => {
        tutorResponse += chunk;
      });
    } catch (err) {
      tutorResponse =
        "Sorry, I couldn't process your question. Try rephrasing it!";
      console.error("Tutor error:", err);
    } finally {
      isAskingTutor = false;
      tutorQuestion = "";
    }
  }

  function handleTutorKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askTutor();
    }
  }

  function finishLesson() {
    goto(`${base}/`);
  }
</script>

<div class="lesson-page">
  <!-- Header -->
  <header class="header">
    <button class="back-btn" onclick={() => goto(`${base}/`)} aria-label="Back">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
      </svg>
    </button>
    <div class="progress-container">
      <div class="progress-bar">
        <div class="fill" style="width: {progress}%"></div>
      </div>
      <span class="progress-text"
        >{currentExerciseIndex + 1}/{exercises.length}</span
      >
    </div>
    <div class="placeholder"></div>
  </header>

  {#if lessonComplete}
    <!-- Lesson Complete Screen -->
    <div class="completion-screen">
      <div class="completion-content">
        <div class="trophy">🏆</div>
        <h1>Lesson Complete!</h1>
        <p class="subtitle">You've mastered Introductions</p>

        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">+{totalXpEarned}</span>
            <span class="stat-label">XP Earned</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{exercises.length}</span>
            <span class="stat-label">Questions</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">100%</span>
            <span class="stat-label">Accuracy</span>
          </div>
        </div>

        <button class="finish-btn" onclick={finishLesson}>
          Continue Learning
        </button>
      </div>
    </div>
  {:else}
    <div class="lesson-content">
      <h2 class="lesson-title">Lesson 1: Introductions</h2>

      <!-- Character Area -->
      <div class="scene">
        <div class="speech-bubble">{currentExercise.target.join(" ")}...</div>
        <div class="character">
          <svg viewBox="0 0 100 100" class="avatar-svg">
            <circle cx="50" cy="50" r="40" fill="#bfdbfe" />
            <circle cx="50" cy="40" r="15" fill="#fde047" />
            <path d="M35 80 Q50 90 65 80 L65 100 L35 100 Z" fill="#3b82f6" />
            <circle cx="45" cy="38" r="2" fill="#1e3a8a" />
            <circle cx="55" cy="38" r="2" fill="#1e3a8a" />
            <path
              d="M45 45 Q50 48 55 45"
              stroke="#1e3a8a"
              stroke-width="2"
              fill="none"
            />
            <path
              d="M35 30 Q50 20 65 30"
              stroke="#1e1e1e"
              stroke-width="4"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <!-- Question -->
      <div class="question-area">
        <p class="instruction">Translate: "{currentExercise.original}"</p>

        <div class="answer-line">
          {#each selectedWords as word (word.id)}
            <button class="word-chip selected" onclick={() => toggleWord(word)}>
              {word.text}
            </button>
          {/each}
          {#if selectedWords.length === 0}
            <span class="placeholder-text">Select words below</span>
          {/if}
        </div>

        <div class="divider"></div>

        <div class="word-bank">
          {#each availableWords as word (word.id)}
            <button
              class="word-chip {word.selected ? 'used' : ''}"
              disabled={word.selected}
              onclick={() => toggleWord(word)}
            >
              {word.text}
            </button>
          {/each}
        </div>
      </div>

      <!-- Wrong Answer Feedback Panel -->
      {#if isCorrect === false}
        <div class="feedback-panel">
          <div class="feedback-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" /><line
                x1="15"
                y1="9"
                x2="9"
                y2="15"
              /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <div class="feedback-content">
            <h3 class="feedback-title">Not quite right</h3>

            {#if isExplaining}
              <div class="explanation-loading">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            {:else if explanation}
              <p class="explanation-text">{explanation}</p>
            {/if}
          </div>

          <!-- Ask Tutor Section -->
          {#if showTutorBox}
            <div class="tutor-section">
              {#if tutorResponse}
                <div class="tutor-response">
                  <div class="tutor-avatar">🎓</div>
                  <p>{tutorResponse}</p>
                </div>
              {/if}

              <div class="tutor-input-container">
                <span class="tutor-label">Ask your personal tutor</span>
                <div class="tutor-input-box">
                  <input
                    type="text"
                    class="tutor-input"
                    placeholder="Why is this word order?"
                    bind:value={tutorQuestion}
                    onkeydown={handleTutorKeydown}
                    disabled={isAskingTutor}
                  />
                  <button
                    class="send-btn"
                    onclick={askTutor}
                    disabled={!tutorQuestion.trim() || isAskingTutor}
                  >
                    {#if isAskingTutor}
                      <svg class="spinner" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="3"
                          fill="none"
                          opacity="0.3"
                        />
                        <path
                          d="M12 2 A10 10 0 0 1 22 12"
                          stroke="currentColor"
                          stroke-width="3"
                          fill="none"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <button class="retry-btn" onclick={() => (isCorrect = null)}>
            Try Again
          </button>
        </div>
      {/if}

      <!-- Success Feedback -->
      {#if isCorrect === true}
        <div class="success-panel">
          <div class="success-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>Correct! +15 XP</h3>
          <button class="continue-btn" onclick={nextExercise}>
            {currentExerciseIndex < exercises.length - 1
              ? "Next Question"
              : "Finish Lesson"}
          </button>
        </div>
      {/if}
    </div>

    <!-- Footer Action -->
    {#if isCorrect === null}
      <footer class="footer">
        <button
          class="action-btn"
          onclick={checkAnswer}
          disabled={selectedWords.length === 0}
        >
          Check
        </button>
      </footer>
    {/if}
  {/if}
</div>

<style>
  .lesson-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
    color: white;
  }

  .header {
    display: flex;
    align-items: center;
    padding: 1rem;
    gap: 1rem;
  }

  .back-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.75rem;
    border-radius: 12px;
    transition: background 0.2s;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .progress-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .progress-bar {
    flex: 1;
    background: rgba(255, 255, 255, 0.1);
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
  }

  .progress-bar .fill {
    background: linear-gradient(90deg, #2dd4bf, #06b6d4);
    height: 100%;
    border-radius: 5px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .progress-text {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
    min-width: 40px;
  }

  .placeholder {
    width: 48px;
  }

  .lesson-content {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    gap: 1.5rem;
  }

  .lesson-title {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
    font-weight: 500;
  }

  .scene {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .speech-bubble {
    background: white;
    color: #0f172a;
    padding: 1rem 1.5rem;
    border-radius: 16px;
    position: relative;
    font-weight: 600;
    font-size: 1.125rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .speech-bubble::after {
    content: "";
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 10px 10px 0;
    border-style: solid;
    border-color: white transparent transparent transparent;
  }

  .character {
    width: 80px;
    height: 80px;
  }

  .avatar-svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
  }

  .question-area {
    width: 100%;
    max-width: 500px;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .instruction {
    color: rgba(255, 255, 255, 0.8);
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .answer-line {
    min-height: 50px;
    border-bottom: 2px dashed rgba(255, 255, 255, 0.3);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    align-items: center;
  }

  .placeholder-text {
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
    font-size: 0.875rem;
  }

  .divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0.5rem 0;
  }

  .word-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }

  .word-chip {
    background: white;
    color: #0f172a;
    border: none;
    padding: 0.6rem 1rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .word-chip:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
  }

  .word-chip.selected {
    background: #2dd4bf;
    color: #0f172a;
  }

  .word-chip.used {
    background: rgba(255, 255, 255, 0.1);
    color: transparent;
    box-shadow: none;
    cursor: default;
  }

  /* Feedback Panel - Wrong Answer */
  .feedback-panel {
    width: 100%;
    max-width: 500px;
    background: linear-gradient(
      135deg,
      rgba(239, 68, 68, 0.15),
      rgba(239, 68, 68, 0.05)
    );
    backdrop-filter: blur(10px);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 20px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .feedback-icon {
    color: #f87171;
    display: flex;
    justify-content: center;
  }
  .feedback-content {
    text-align: center;
  }
  .feedback-title {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: #fca5a5;
  }

  .explanation-text {
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    line-height: 1.5;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.75rem;
    border-radius: 10px;
    border-left: 3px solid #f87171;
    text-align: left;
  }

  .explanation-loading {
    display: flex;
    justify-content: center;
    gap: 4px;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #f87171;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out;
  }

  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }
  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  /* Tutor Section */
  .tutor-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .tutor-response {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 10px;
    padding: 0.75rem;
  }

  .tutor-avatar {
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .tutor-response p {
    margin: 0;
    color: white;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .tutor-input-container {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .tutor-label {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tutor-input-box {
    display: flex;
    gap: 0.4rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    padding: 0.4rem;
    transition: border-color 0.2s;
  }

  .tutor-input-box:focus-within {
    border-color: rgba(139, 92, 246, 0.5);
  }

  .tutor-input {
    flex: 1;
    background: none;
    border: none;
    color: white;
    font-size: 0.9rem;
    padding: 0.4rem;
    outline: none;
  }

  .tutor-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .send-btn {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    border-radius: 8px;
    padding: 0.6rem;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    transform: scale(1.05);
  }
  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 18px;
    height: 18px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .retry-btn {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
    padding: 0.75rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .retry-btn:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  /* Success Panel */
  .success-panel {
    width: 100%;
    max-width: 500px;
    background: linear-gradient(
      135deg,
      rgba(34, 197, 94, 0.15),
      rgba(34, 197, 94, 0.05)
    );
    backdrop-filter: blur(10px);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 20px;
    padding: 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    animation: slideUp 0.3s ease-out;
  }

  .success-icon {
    color: #4ade80;
  }
  .success-panel h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #4ade80;
  }

  .continue-btn {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border: none;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .continue-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
  }

  /* Footer */
  .footer {
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .action-btn {
    width: 100%;
    padding: 0.9rem;
    border-radius: 12px;
    font-weight: 700;
    font-size: 1rem;
    border: none;
    cursor: pointer;
    background: linear-gradient(135deg, #2dd4bf, #06b6d4);
    color: #0f172a;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(45, 212, 191, 0.4);
  }
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Completion Screen */
  .completion-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .completion-content {
    text-align: center;
    max-width: 400px;
  }

  .trophy {
    font-size: 4rem;
    margin-bottom: 1rem;
    animation: bounce-trophy 1s ease-out;
  }

  @keyframes bounce-trophy {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  .completion-content h1 {
    margin: 0 0 0.5rem;
    font-size: 2rem;
    background: linear-gradient(to right, #2dd4bf, #8b5cf6);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-item {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #2dd4bf;
  }

  .stat-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
  }

  .finish-btn {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    color: white;
    padding: 1rem 2rem;
    border-radius: 12px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .finish-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(139, 92, 246, 0.4);
  }
</style>
