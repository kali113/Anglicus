<script lang="ts">
  import { onMount } from "svelte";
  import { getUserProfile } from "$lib/storage/user-store.js";
  import type { LanguageCode } from "$lib/types/user.js";
  import { AiRequestError, getCompletion, ContextEngine } from "$lib/ai/index.js";
  import type { ChatMessage } from "$lib/types/api.js";
  import PaywallModal from "$lib/components/PaywallModal.svelte";
  import {
    checkBillingAccess,
    getFeatureLabel,
    markPaywallShown,
    recordBillingUsage,
  } from "$lib/billing/index.js";
  import { locale, t } from "$lib/i18n";

  let profile = $state<Awaited<ReturnType<typeof getUserProfile>>>(null);
  let targetLanguage = $state<LanguageCode>("en");
  let uiLanguage = $derived($locale);
  const targetLabel = $derived($t(`languages.name.${targetLanguage}`));
  const placeholderLanguage = $derived(
    uiLanguage === "es" ? targetLabel.toLowerCase() : targetLabel,
  );
  let messages = $state<ChatMessage[]>([]);
  let inputMessage = $state("");
  let isLoading = $state(false);
  let isExpanded = $state(false);
  let chatContainer = $state<HTMLElement | null>(null);
  let showPaywall = $state(false);
  let paywallMode = $state<"nag" | "block">("block");
  let paywallFeature = $state(getFeatureLabel("quickChat"));

  onMount(async () => {
    profile = await getUserProfile();
    targetLanguage = profile?.targetLanguage ?? "en";
  });

  async function sendMessage() {
    if (!inputMessage.trim() || isLoading || !profile) return;

    const decision = await checkBillingAccess("quickChat");
    if (decision) {
      if (decision.mode === "block") {
        openPaywall("block", getFeatureLabel("quickChat"));
        return;
      }
      if (decision.mode === "nag") {
        openPaywall("nag", getFeatureLabel("quickChat"));
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
    isExpanded = true;

    try {
      const engine = new ContextEngine(profile);
      const systemPrompt = engine.generateSystemPrompt("Quick Help");

      const apiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.slice(-6).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const response = await getCompletion(apiMessages, {
        maxTokens: 200,
        feature: "quickChat",
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.content,
        timestamp: new Date().toISOString(),
      };

      messages = [...messages, assistantMessage];
      await recordBillingUsage("quickChat");
    } catch (error) {
      if (error instanceof AiRequestError && error.status === 429) {
        await openPaywall("block", getFeatureLabel("quickChat"));
        return;
      }
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: $t("quickChat.error"),
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    messages = [];
    isExpanded = false;
  }

  async function openPaywall(mode: "nag" | "block", feature: string) {
    paywallMode = mode;
    paywallFeature = feature;
    showPaywall = true;
    await markPaywallShown();
  }
</script>

<div class="quick-chat" class:expanded={isExpanded}>
  <div class="chat-header">
    <div class="header-left">
      <span class="chat-icon">💬</span>
      <span class="chat-title">{$t("quickChat.title")}</span>
    </div>
    {#if messages.length > 0}
      <button class="clear-btn" onclick={clearChat}>
        {$t("quickChat.clear")}
      </button>
    {/if}
  </div>

  {#if isExpanded && messages.length > 0}
    <div bind:this={chatContainer} class="messages-container">
      {#each messages as message}
        <div class="message" class:user={message.role === "user"}>
          <div class="bubble">{message.content}</div>
        </div>
      {/each}

      {#if isLoading}
        <div class="message">
          <div class="bubble loading">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="input-row">
    <input
      type="text"
      bind:value={inputMessage}
      placeholder={$t("quickChat.placeholder", { language: placeholderLanguage })}
      onkeydown={handleKeydown}
      disabled={isLoading}
    />
    <button
      class="send-btn"
      onclick={sendMessage}
      disabled={!inputMessage.trim() || isLoading}
      aria-label={$t("quickChat.send")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
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
  .quick-chat {
    background: linear-gradient(
      135deg,
      rgba(139, 92, 246, 0.1),
      rgba(99, 102, 241, 0.05)
    );
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 16px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    transition: all 0.3s ease;
  }

  .quick-chat.expanded {
    background: linear-gradient(
      135deg,
      rgba(139, 92, 246, 0.15),
      rgba(99, 102, 241, 0.08)
    );
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chat-icon {
    font-size: 1.25rem;
  }

  .chat-title {
    font-weight: 600;
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .clear-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: rgba(255, 255, 255, 0.6);
    padding: 0.25rem 0.75rem;
    border-radius: 8px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
  }

  .messages-container {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 0.25rem;
  }

  .message {
    display: flex;
  }

  .message.user {
    justify-content: flex-end;
  }

  .bubble {
    max-width: 85%;
    padding: 0.5rem 0.75rem;
    border-radius: 12px;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .message.user .bubble {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .message:not(.user) .bubble {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-bottom-left-radius: 4px;
  }

  .bubble.loading {
    display: flex;
    gap: 4px;
    padding: 0.6rem 0.75rem;
  }

  .dot {
    width: 6px;
    height: 6px;
    background: rgba(255, 255, 255, 0.6);
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

  .input-row {
    display: flex;
    gap: 0.5rem;
  }

  .input-row input {
    flex: 1;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    padding: 0.6rem 0.9rem;
    color: white;
    font-size: 0.9rem;
    outline: none;
    transition: all 0.2s;
  }

  .input-row input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .input-row input:focus {
    border-color: rgba(139, 92, 246, 0.5);
    background: rgba(255, 255, 255, 0.12);
  }

  .send-btn {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
