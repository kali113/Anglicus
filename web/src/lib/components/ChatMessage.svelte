<script lang="ts">
  import { fly } from "svelte/transition";
  import type { Message } from "$lib/types/api";

  interface $$Props {
    message: Message;
  }

  let { message } = $props();
</script>

<div class="message {message.role}" in:fly={{ y: 20, duration: 300 }}>
  <div class="avatar">
    {message.role === "assistant" ? "🤖" : "👤"}
  </div>
  <div class="bubble">
    <!-- Simple markdown rendering for bold text -->
    {@html message.content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>")}
  </div>
</div>

<style>
  .message {
    display: flex;
    gap: 1rem;
    max-width: 98%;
    align-items: flex-end;
  }

  .message.user {
    align-self: flex-end;
    flex-direction: row-reverse;
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

  .message.user .bubble {
    background: linear-gradient(135deg, #2dd4bf, #3b82f6);
    color: white;
    border-bottom-right-radius: 4px;
    box-shadow: 0 4px 12px rgba(45, 212, 191, 0.2);
  }
</style>
