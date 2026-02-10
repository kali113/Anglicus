<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { getUserProfile } from "$lib/storage/user-store.js";
  import { getLanguageLabel } from "$lib/types/user.js";
  import { getCompletion, ContextEngine } from "$lib/ai/index.js";
  import type { ChatMessage } from "$lib/types/api.js";
  import PaywallModal from "$lib/components/PaywallModal.svelte";
  import {
    checkBillingAccess,
    getFeatureLabel,
    markPaywallShown,
    recordBillingUsage,
  } from "$lib/billing/index.js";

  let profile = getUserProfile();
  const targetLanguage = profile?.targetLanguage ?? "en";
  const uiLanguage = profile?.nativeLanguage ?? "es";
  const targetLabel = $derived(getLanguageLabel(targetLanguage, uiLanguage));
  let messages = $state<ChatMessage[]>([]);
  let inputMessage = $state("");
  let isLoading = $state(false);
  let errorMessage = $state("");
  let chatContainer: HTMLElement;
  let showPaywall = $state(false);
  let paywallMode = $state<"nag" | "block">("block");
  let paywallFeature = $state(getFeatureLabel("tutor"));

  onMount(() => {
    if (!profile) {
      window.location.href = `${base}/onboarding`;
      return;
    }
    scrollToBottom();
  });

  async function sendMessage() {
    if (!inputMessage.trim() || isLoading || !profile) return;

    const decision = checkBillingAccess("tutor");
    if (decision) {
      if (decision.mode === "block") {
        openPaywall("block", getFeatureLabel("tutor"));
        return;
      }
      if (decision.mode === "nag") {
        openPaywall("nag", getFeatureLabel("tutor"));
      }
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    messages = [...messages, userMessage];
    inputMessage = "";
    isLoading = true;
    errorMessage = "";

    try {
      const engine = new ContextEngine(profile);
      const systemPrompt = engine.generateSystemPrompt("General Conversation");

      const apiMessages = [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        ...messages.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const response = await getCompletion(apiMessages, { maxTokens: 300 });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.content,
        timestamp: new Date().toISOString(),
      };

      messages = [...messages, assistantMessage];
      recordBillingUsage("tutor");
    } catch (error) {
      errorMessage =
        "Error de conexión. Ve a Configuración para elegir otra API o agregar tu propia clave.";
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Lo siento, hubo un error de conexión. ",
          timestamp: new Date().toISOString(),
        },
      ];
    } finally {
      isLoading = false;
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 50);
  }

  function openPaywall(mode: "nag" | "block", feature: string) {
    paywallMode = mode;
    paywallFeature = feature;
    showPaywall = true;
    markPaywallShown();
  }
</script>

<div class="tutor-page">
  <header class="header">
    <h1>Tutor IA</h1>
    <p class="subtitle">
      {uiLanguage === "es"
        ? `Practica ${targetLabel.toLowerCase()} conmigo`
        : `Practice ${targetLabel} with me`}
    </p>
  </header>

  <div bind:this={chatContainer} class="chat-container">
    {#if messages.length === 0}
      <div class="empty-state">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          /></svg
        >
        <p>
          {uiLanguage === "es"
            ? `¡Hola! Soy tu tutor de ${targetLabel.toLowerCase()}.`
            : `Hi! I'm your ${targetLabel} tutor.`}
        </p>
        <p>
          {uiLanguage === "es"
            ? "Escribe algo para empezar a practicar."
            : "Type something to start practicing."}
        </p>
      </div>
    {/if}

    {#each messages as message}
      <div class="message" class:user={message.role === "user"}>
        <div class="message-bubble">
          {message.content}
        </div>
      </div>
    {/each}

    {#if isLoading}
      <div class="message assistant">
        <div class="message-bubble loading">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    {/if}
  </div>

  <form
    class="input-form"
    onsubmit={(e) => {
      e.preventDefault();
      sendMessage();
    }}
  >
    {#if errorMessage}
      <div class="error-banner">
        {errorMessage}
        <a href={`${base}/settings`}>Configuración</a>
      </div>
    {/if}
    <input
      type="text"
      bind:value={inputMessage}
      placeholder="Escribe tu mensaje..."
      disabled={isLoading}
      onkeydown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
    />
    <button
      type="submit"
      disabled={!inputMessage.trim() || isLoading}
      class="send-btn"
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
          points="22 2 15 22 11 13 11 2"
        /></svg
      >
    </button>
  </form>
</div>

<PaywallModal
  open={showPaywall}
  mode={paywallMode}
  featureLabel={paywallFeature}
  on:close={() => (showPaywall = false)}
  on:paid={() => (showPaywall = false)}
/>

<style>
  .tutor-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - var(--nav-height) - 2rem);
  }

  .header {
    text-align: center;
    margin-bottom: 1rem;
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

  .chat-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }

  .empty-state svg {
    margin: 0 auto 1rem;
    color: var(--primary);
  }

  .message {
    display: flex;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message-bubble {
    max-width: 80%;
    padding: 0.75rem 1rem;
    border-radius: 16px;
    line-height: 1.4;
  }

  .message.user .message-bubble {
    background: var(--primary);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .message.assistant .message-bubble {
    background: var(--bg);
    border: 1px solid var(--border);
    border-bottom-left-radius: 4px;
  }

  .message-bubble.loading {
    display: flex;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: var(--text-secondary);
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
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

  .input-form {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .input-form input {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 2px solid var(--border);
    border-radius: 24px;
    font-size: 1rem;
  }

  .input-form input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .send-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--primary-dark);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    flex: 1;
    padding: 0.75rem 1rem;
    background: #fee2e2;
    border-radius: 12px;
    color: #991b1b;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .error-banner a {
    color: #991b1b;
    font-weight: 600;
    text-decoration: underline;
    white-space: nowrap;
  }
</style>
