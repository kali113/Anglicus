<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
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

  let progress = $state(20);

  // Explanation state
  let explanation = $state("");
  let isExplaining = $state(false);

  // Exercise data
  const targetSentence = ["Hello", "my", "name", "is", "Alex"];
  const originalSentence = "Hola, me llamo...";

  // Initial word bank state
  let availableWords = $state<Word[]>([
    { id: "1", text: "Hello", selected: false },
    { id: "2", text: "name", selected: false },
    { id: "3", text: "is", selected: false },
    { id: "4", text: "Alex", selected: false },
    { id: "5", text: "my", selected: false },
    { id: "6", text: "nice", selected: false },
    { id: "7", text: "meet", selected: false },
  ]);

  let selectedWords = $state<Word[]>([]);
  let isCorrect = $state<boolean | null>(null);

  function toggleWord(word: Word) {
    if (isCorrect === true) return; // Only disable interaction if successfully completed

    // If trying to change answer while showing error, reset state
    if (isCorrect === false) {
      isCorrect = null;
      explanation = ""; // Reset explanation
    }

    if (selectedWords.find((w) => w.id === word.id)) {
      // Remove from selection
      selectedWords = selectedWords.filter((w) => w.id !== word.id);
      const w = availableWords.find((w) => w.id === word.id);
      if (w) w.selected = false;
    } else {
      // Add to selection
      selectedWords = [...selectedWords, word];
      const w = availableWords.find((w) => w.id === word.id);
      if (w) w.selected = true;
    }
  }

  async function checkAnswer() {
    const constructedSentence = selectedWords.map((w) => w.text).join(" ");
    const correctSentence = targetSentence.join(" ");

    isCorrect = constructedSentence === correctSentence;

    if (isCorrect) {
      progress = 100;
      addXp(50);
      incrementWordsLearned(5);
      updateWeeklyActivity(5);
      unlockAchievement("early_bird");
    } else {
      // Mistake made: Trigger AI explanation
      explanation = "";
      isExplaining = true;

      const userAttempt = constructedSentence;
      const target = correctSentence;

      const messages = [
        {
          role: "system" as const,
          content:
            "You are a helpful English tutor. Explain briefly (1-2 sentences) why the user's translation is wrong compared to the target. Focus on grammar or word order.",
        },
        {
          role: "user" as const,
          content: `Original: "${originalSentence}"\nTarget: "${target}"\nUser Wrote: "${userAttempt}"\nExplain the mistake.`,
        },
      ];

      try {
        await streamCompletion(messages, (chunk) => {
          explanation += chunk;
        });
      } catch (err) {
        console.error("Explanation error:", err);
      } finally {
        isExplaining = false;
      }
    }
  }

  function continueLesson() {
    goto("/");
  }
</script>

<div class="lesson-page">
  <!-- Header -->
  <header class="header">
    <button class="back-btn" onclick={() => goto("/")}>
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
        ><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg
      >
    </button>
    <div class="progress-container">
      <div class="progress-bar">
        <div class="fill" style="width: {progress}%"></div>
      </div>
    </div>
    <div class="placeholder"></div>
  </header>

  <div class="lesson-content">
    <h2 class="lesson-title">Lesson 1: Introductions</h2>

    <!-- Character Area -->
    <div class="scene">
      <div class="speech-bubble">Hello, my name is...</div>
      <div class="character">
        <!-- Simple SVG Character -->
        <svg viewBox="0 0 100 100" class="avatar-svg">
          <circle cx="50" cy="50" r="40" fill="#bfdbfe" />
          <circle cx="50" cy="40" r="15" fill="#fde047" />
          <!-- Face -->
          <path d="M35 80 Q50 90 65 80 L65 100 L35 100 Z" fill="#3b82f6" />
          <!-- Shirt -->
          <circle cx="45" cy="38" r="2" fill="#1e3a8a" />
          <!-- Eye -->
          <circle cx="55" cy="38" r="2" fill="#1e3a8a" />
          <!-- Eye -->
          <path
            d="M45 45 Q50 48 55 45"
            stroke="#1e3a8a"
            stroke-width="2"
            fill="none"
          />
          <!-- Mouth -->
          <path
            d="M35 30 Q50 20 65 30"
            stroke="#1e1e1e"
            stroke-width="4"
            fill="none"
          />
          <!-- Hair -->
        </svg>
      </div>
    </div>

    <!-- Question -->
    <div class="question-area">
      <p class="instruction">Translate: "{originalSentence}"</p>

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
        {#each availableWords as word}
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
  </div>

  <!-- Footer Action -->
  <footer
    class="footer {isCorrect !== null
      ? isCorrect
        ? 'correct'
        : 'incorrect'
      : ''}"
  >
    {#if isCorrect !== null}
      <div class="feedback">
        {#if isCorrect}
          <div class="feedback-header">
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
              ><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline
                points="22 4 12 14.01 9 11.01"
              /></svg
            >
            <span>Excellent!</span>
          </div>
          <button class="action-btn success" onclick={continueLesson}
            >Continue</button
          >
        {:else}
          <div class="feedback-header">
            <div class="feedback-response">
              <div class="feedback-title">
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
                  ><circle cx="12" cy="12" r="10" /><line
                    x1="15"
                    y1="9"
                    x2="9"
                    y2="15"
                  /><line x1="9" y1="9" x2="15" y2="15" /></svg
                >
                <span>Try again</span>
              </div>
              {#if explanation}
                <p class="ai-explanation">
                  <span class="ai-label">Anglicus:</span>
                  {explanation}
                </p>
              {/if}
            </div>
          </div>
          <button class="action-btn error" onclick={() => (isCorrect = null)}
            >Retry</button
          >
        {/if}
      </div>
    {:else}
      <button
        class="action-btn"
        onclick={checkAnswer}
        disabled={selectedWords.length === 0}
      >
        Check
      </button>
    {/if}
  </footer>
</div>

<style>
  .lesson-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg);
    color: white;
  }

  .header {
    display: flex;
    align-items: center;
    padding: 1rem;
    gap: 1rem;
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.5rem;
  }

  .progress-container {
    flex: 1;
    background: var(--bg-card);
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar .fill {
    background: var(--primary);
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .placeholder {
    width: 40px;
  }

  .lesson-content {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
  }

  .lesson-title {
    font-size: 1rem;
    color: var(--text-muted);
    margin-bottom: 2rem;
    font-weight: 500;
  }

  .scene {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .speech-bubble {
    background: white;
    color: var(--bg);
    padding: 1rem 1.5rem;
    border-radius: 16px;
    position: relative;
    font-weight: 600;
    font-size: 1.125rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
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
    width: 100px;
    height: 100px;
  }

  .avatar-svg {
    width: 100%;
    height: 100%;
  }

  .question-area {
    width: 100%;
    max-width: 400px;
    background: var(--bg-card);
    padding: 1.5rem;
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .instruction {
    color: var(--text-secondary);
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .answer-line {
    min-height: 60px;
    border-bottom: 2px dashed var(--border);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    align-items: center;
  }

  .placeholder-text {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.875rem;
  }

  .divider {
    height: 1px;
    background: var(--border);
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
    color: var(--bg);
    border: 1px solid #e5e7eb;
    padding: 0.75rem 1.25rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .word-chip:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .word-chip.selected {
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.1);
  }

  .word-chip.used {
    background: var(--bg-card-light);
    color: transparent;
    border-color: transparent;
    box-shadow: none;
    cursor: default;
  }

  .footer {
    padding: 1rem;
    background: var(--bg-card);
    border-top: 1px solid var(--border);
  }

  .footer.correct {
    background: #dcfce7;
    border-color: #86efac;
  }

  .footer.incorrect {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  .action-btn {
    width: 100%;
    padding: 1rem;
    border-radius: 12px;
    font-weight: 700;
    font-size: 1rem;
    border: none;
    cursor: pointer;
    background: var(--primary);
    color: white;
    transition: background 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--primary-dark);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.success {
    background: var(--success);
  }

  .action-btn.error {
    background: var(--error);
  }

  .feedback {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .feedback-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(
      --success
    ); /* Default to success text color logic handled via wrapper class usually, but explicit here */
    font-weight: 700;
    font-size: 1.125rem;
  }

  .footer.correct .feedback-header {
    color: #15803d;
  }

  .footer.incorrect .feedback-header .feedback-title {
    color: #b91c1c;
  }

  .feedback-response {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .feedback-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .ai-explanation {
    font-size: 0.95rem;
    color: #4b5563; /* Dark gray for readability */
    margin: 0;
    line-height: 1.4;
    background: rgba(255, 255, 255, 0.5);
    padding: 0.75rem;
    border-radius: 8px;
    border-left: 3px solid #f87171;
  }

  .ai-label {
    font-weight: 700;
    color: #b91c1c;
    margin-right: 0.25rem;
  }
</style>
