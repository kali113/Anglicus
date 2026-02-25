<script lang="ts">
  import { base } from "$app/paths";
  import { onMount } from "svelte";
  import { setAnalyticsConsent, shouldShowConsentBanner } from "$lib/consent/index.js";
  import { trackPageView, trackWebEvent } from "$lib/analytics/index.js";
  import { t } from "$lib/i18n";

  interface Props {
    legalHref: string;
  }

  let { legalHref }: Props = $props();
  let isVisible = $state(false);

  onMount(() => {
    isVisible = shouldShowConsentBanner();
  });

  async function acceptAnalytics(): Promise<void> {
    setAnalyticsConsent("accepted");
    isVisible = false;
    await trackWebEvent("consent_accepted", {
      pagePath: `${window.location.pathname}${window.location.search}`,
      metadata: { source: "cookie_banner" },
    });
    await trackPageView();
  }

  function rejectAnalytics(): void {
    setAnalyticsConsent("rejected");
    isVisible = false;
  }

  const fallbackLegalHref = $derived(`${base}/legal#cookies`);
  const resolvedLegalHref = $derived(legalHref || fallbackLegalHref);
</script>

{#if isVisible}
  <aside class="consent-banner" aria-live="polite" aria-label={$t("consent.title")}>
    <div class="consent-content">
      <div class="copy">
        <h3>{$t("consent.title")}</h3>
        <p>{$t("consent.body")}</p>
        <a href={resolvedLegalHref} class="legal-link">{$t("consent.learnMore")}</a>
      </div>
      <div class="actions">
        <button class="btn secondary" type="button" onclick={rejectAnalytics}>
          {$t("consent.reject")}
        </button>
        <button class="btn primary" type="button" onclick={acceptAnalytics}>
          {$t("consent.accept")}
        </button>
      </div>
    </div>
  </aside>
{/if}

<style>
  .consent-banner {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    z-index: 100;
    border: 1px solid rgba(45, 212, 191, 0.35);
    background: linear-gradient(145deg, rgba(2, 6, 23, 0.96), rgba(15, 23, 42, 0.96));
    border-radius: 16px;
    box-shadow:
      0 24px 50px rgba(2, 6, 23, 0.58),
      0 0 0 1px rgba(45, 212, 191, 0.1) inset;
    backdrop-filter: blur(6px);
  }

  .consent-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.15rem;
  }

  .copy h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 1rem;
  }

  .copy p {
    margin: 0.4rem 0;
    color: #94a3b8;
    line-height: 1.45;
    max-width: 760px;
    font-size: 0.92rem;
  }

  .legal-link {
    color: #5eead4;
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .legal-link:hover {
    text-decoration: underline;
  }

  .actions {
    display: flex;
    gap: 0.7rem;
  }

  .btn {
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 0.55rem 0.9rem;
    font-size: 0.84rem;
    font-weight: 650;
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .btn:hover {
    transform: translateY(-1px);
  }

  .btn.secondary {
    background: rgba(51, 65, 85, 0.58);
    border-color: rgba(148, 163, 184, 0.35);
    color: #e2e8f0;
  }

  .btn.primary {
    background: linear-gradient(120deg, #2dd4bf, #14b8a6);
    color: #082f49;
    border-color: rgba(20, 184, 166, 0.8);
  }

  @media (max-width: 900px) {
    .consent-content {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions {
      width: 100%;
    }

    .btn {
      flex: 1;
      text-align: center;
    }
  }
</style>
