<script lang="ts">
  import { page } from "$app/stores";
  import { completeLesson } from "$lib/storage/user-store";
  import { goto } from "$app/navigation";
import { base } from "$app/paths";
  import confetti from "canvas-confetti";
  import ChatInterface from "$lib/components/ChatInterface.svelte";
  import { fade } from "svelte/transition";

  const lessonId = $page.params.id ?? "general-practice";
  let isCompleted = false;

  function handleComplete() {
    isCompleted = true;
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.6 },
      colors: ["#2dd4bf", "#3b82f6", "#f59e0b"],
    });

    completeLesson(lessonId);

    setTimeout(() => {
      goto(`${base}/`);
    }, 2500);
  }
</script>

<div class="lesson-page" in:fade>
  <div class="lesson-container">
    <header class="lesson-header">
      <button class="back-btn" onclick={() => goto(`${base}/`)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
        >
        Back
      </button>
      <h1>{lessonId.replace(/-/g, " ")}</h1>
      <div class="progress">
        <div class="streak">🔥 Practice Mode</div>
      </div>
    </header>

    <main class="chat-wrapper">
      <ChatInterface {lessonId} onComplete={handleComplete} />
    </main>
  </div>

  {#if isCompleted}
    <div class="success-overlay" in:fade>
      <div class="success-card">
        <div class="icon">🎉</div>
        <h2>Lesson Completed!</h2>
        <p>
          You earned <strong>50 XP</strong> and learned
          <strong>12 new words</strong>.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .lesson-page {
    height: 100vh;
    width: 100%;
    background: radial-gradient(circle at top right, #0f172a 0%, #020617 100%);
    color: white;
    overflow: hidden;
    position: relative;
  }

  .lesson-container {
    width: auto;
    margin: 0 1rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    box-sizing: border-box;
  }

  .lesson-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 0;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    text-transform: capitalize;
    margin: 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    transition: background 0.2s;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .streak {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.9rem;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .chat-wrapper {
    flex: 1;
    min-height: 0; /* Important for flex child scrolling */
  }

  .success-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .success-card {
    background: rgba(31, 41, 55, 0.9);
    padding: 3rem;
    border-radius: 24px;
    text-align: center;
    border: 1px solid rgba(45, 212, 191, 0.3);
    box-shadow: 0 0 50px rgba(45, 212, 191, 0.2);
    animation: popUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .success-card .icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .success-card h2 {
    font-size: 2rem;
    margin: 0 0 1rem 0;
    background: linear-gradient(to right, #2dd4bf, #3b82f6);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .success-card p {
    font-size: 1.2rem;
    color: #cbd5e1;
  }

  @keyframes popUp {
    from {
      transform: scale(0.8);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
