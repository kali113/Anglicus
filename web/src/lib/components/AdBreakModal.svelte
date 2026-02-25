<script lang="ts">
  import AdSlot from "$lib/components/AdSlot.svelte";
  import type { BillingInfo } from "$lib/types/user.js";
  import { t } from "$lib/i18n";

  interface Props {
    open: boolean;
    title: string;
    body: string;
    placement: string;
    slotId: string;
    billing?: BillingInfo | null;
    durationSec?: number;
    onclose?: () => void;
  }

  let {
    open,
    title,
    body,
    placement,
    slotId,
    billing = null,
    durationSec = 6,
    onclose,
  }: Props = $props();

  let secondsLeft = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    stopTimer();
    secondsLeft = durationSec;
    timer = setInterval(() => {
      secondsLeft = Math.max(0, secondsLeft - 1);
      if (secondsLeft === 0) {
        stopTimer();
      }
    }, 1000);
  }

  $effect(() => {
    if (!open) {
      stopTimer();
      return;
    }

    startTimer();

    return () => {
      stopTimer();
    };
  });

  function closeModal() {
    if (secondsLeft > 0) return;
    onclose?.();
  }
</script>

{#if open}
  <div
    class="ad-break-backdrop"
    role="button"
    tabindex="0"
    aria-label={$t("common.close")}
    onclick={(event) => event.currentTarget === event.target && closeModal()}
    onkeydown={(event) =>
      (event.key === "Escape" || event.key === "Enter" || event.key === " ") &&
      closeModal()}
  >
    <div class="ad-break-card" role="dialog" aria-modal="true">
      <h3>{title}</h3>
      <p>{body}</p>
      <AdSlot
        placement={placement}
        slotId={slotId}
        {billing}
        minHeight="120px"
      />
      <button class="continue-btn" type="button" onclick={closeModal} disabled={secondsLeft > 0}>
        {secondsLeft > 0
          ? $t("ads.continueIn", { seconds: secondsLeft })
          : $t("ads.continue")}
      </button>
    </div>
  </div>
{/if}

<style>
  .ad-break-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1300;
    background: rgba(2, 6, 23, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
  }

  .ad-break-card {
    width: min(480px, 100%);
    border-radius: 18px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: #0f172a;
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
  }

  .ad-break-card h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 1.15rem;
  }

  .ad-break-card p {
    margin: 0;
    color: rgba(226, 232, 240, 0.85);
    line-height: 1.4;
  }

  .continue-btn {
    justify-self: end;
    border: 1px solid rgba(45, 212, 191, 0.5);
    background: rgba(20, 184, 166, 0.16);
    color: #d1fae5;
    border-radius: 10px;
    padding: 0.55rem 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .continue-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
