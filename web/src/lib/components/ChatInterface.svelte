<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import {
    addXp,
    incrementWordsLearned,
    updateWeeklyActivity,
    getUserProfile,
  } from "$lib/storage/user-store";
  import ChatMessage from "$lib/components/ChatMessage.svelte";
  import { getWelcomeMessage, getSystemPrompt } from "$lib/ai/chat-utils";
  import type { Message } from "$lib/types/api";
  import PaywallModal from "$lib/components/PaywallModal.svelte";
  import {
    checkBillingAccess,
    getFeatureLabel,
    markPaywallShown,
    recordBillingUsage,
  } from "$lib/billing/index.js";

  let { lessonId, onComplete }: { lessonId: string; onComplete: () => void } = $props();

  let messages: Message[] = [];
  let inputValue = "";
  let isLoading = false;
  let chatContainer: HTMLElement;
  let showPaywall = $state(false);
  let paywallMode = $state<"nag" | "block">("block");
  let paywallFeature = $state(getFeatureLabel("lessonChat"));
  const profile = getUserProfile();
  const targetLanguage = profile?.targetLanguage ?? "en";

  // Initial welcome message based on lesson ID
  onMount(() => {
    const welcomeMsg = getWelcomeMessage(lessonId, targetLanguage);
    messages = [{ role: "assistant", content: welcomeMsg }];
  });

  async function scrollToBottom() {
    await tick();
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  async function sendMessage() {
    if (!inputValue.trim() || isLoading) return;

    const decision = checkBillingAccess("lessonChat");
    if (decision) {
      if (decision.mode === "block") {
        openPaywall("block", getFeatureLabel("lessonChat"));
        return;
      }
      if (decision.mode === "nag") {
        openPaywall("nag", getFeatureLabel("lessonChat"));
      }
    }

    const userMsg = inputValue.trim();
    inputValue = "";
    messages = [...messages, { role: "user", content: userMsg }];
    await scrollToBottom();

    isLoading = true;

    try {
      const systemPrompt = getSystemPrompt(lessonId, targetLanguage);
      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      const response = await fetch(
        "http://localhost:8787/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "anglicus-tutor", // Use smart router
            messages: apiMessages,
            temperature: 0.7,
          }),
        },
      );

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        const aiMsg = data.choices[0].message.content;
        messages = [...messages, { role: "assistant", content: aiMsg }];
        recordBillingUsage("lessonChat");

        // Gamification hooks
        if (messages.length % 4 === 0) {
          // Every 2 exchanges
          addXp(10);
          incrementWordsLearned(1);
          updateWeeklyActivity(2); // 2 minutes approx
        }
      } else {
        messages = [
          ...messages,
          {
            role: "assistant",
            content:
              "Sorry, I'm having trouble connecting right now. Let's try again.",
          },
        ];
      }
    } catch (e) {
      console.error(e);
      messages = [
        ...messages,
        {
          role: "assistant",
          content: "Connection error. Please check if the API is running.",
        },
      ];
    } finally {
      isLoading = false;
      await scrollToBottom();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function openPaywall(mode: "nag" | "block", feature: string) {
    paywallMode = mode;
    paywallFeature = feature;
    showPaywall = true;
    markPaywallShown();
  }
</script>

<div class="chat-interface">
  <div class="messages" bind:this={chatContainer}>
    {#each messages as msg}
      <ChatMessage message={msg} />
    {/each}

    {#if isLoading}
      <div class="message assistant loading" in:fade>
        <div class="avatar">🤖</div>
        <div class="bubble typing-indicator">
          <span>.</span><span>.</span><span>.</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <div class="input-wrapper">
      <textarea
        bind:value={inputValue}
        on:keydown={handleKeydown}
        placeholder="Type your answer here..."
        rows="1"
      ></textarea>
      <button
        class="send-btn"
        on:click={sendMessage}
        disabled={isLoading || !inputValue.trim()}
        aria-label="Send message"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><line x1="22" y1="2" x2="11" y2="13" /><polygon
            points="22 2 15 22 11 13 2 9 22 2"
          /></svg
        >
      </button>
    </div>

    <div class="actions">
      <button class="action-btn secondary" on:click={onComplete}
        >Finish Lesson</button
      >
    </div>
  </div>
</div>

<PaywallModal
  open={showPaywall}
  mode={paywallMode}
  featureLabel={paywallFeature}
  onclose={() => (showPaywall = false)}
  onpaid={() => (showPaywall = false)}
/>

<style>
  .chat-interface {
    display: flex;
    flex-direction: column;
    height: 100%;
    /* max-height: 600px; */
    background: rgba(17, 24, 39, 0.4);
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    scroll-behavior: smooth;
  }

  /* Temporary styles for loading state until we extract that too or fix shared styles */
  .message {
    display: flex;
    gap: 1rem;
    max-width: 98%;
    align-items: flex-end;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .bubble {
    padding: 1rem 1.25rem;
    border-radius: 18px;
    background: rgba(31, 41, 55, 0.8);
    color: #e2e8f0;
    line-height: 1.5;
    font-size: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.assistant .bubble {
    background: rgba(30, 41, 59, 0.8);
    border-bottom-left-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 1rem 1.25rem;
  }

  .typing-indicator span {
    animation: bounce 1.4s infinite ease-in-out both;
    font-size: 1.5rem;
    line-height: 10px;
  }

  .typing-indicator span:nth-child(1) {
    animation-delay: -0.32s;
  }
  .typing-indicator span:nth-child(2) {
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

  .input-area {
    padding: 1.5rem;
    background: rgba(17, 24, 39, 0.6);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .input-wrapper {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    background: rgba(31, 41, 55, 0.6);
    padding: 0.5rem;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: border-color 0.2s;
  }

  .input-wrapper:focus-within {
    border-color: rgba(45, 212, 191, 0.5);
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.2);
  }

  textarea {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    padding: 0.75rem;
    font-size: 1rem;
    resize: none;
    max-height: 100px;
    font-family: inherit;
    outline: none;
  }

  .send-btn {
    background: var(--primary, #2dd4bf);
    color: #0f172a;
    border: none;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    transform: scale(1.05);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #475569;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .action-btn {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
  }

  .action-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }
</style>
