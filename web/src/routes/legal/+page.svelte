<script lang="ts">
  import { t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t("legal.headTitle")}</title>
</svelte:head>

<div class="legal-page">
  <header class="legal-header">
    <h1>{$t("legal.title")}</h1>
    <p>{$t("legal.lastUpdated", { date: "2026-02-10" })}</p>
    <p>{$t("legal.disclaimer")}</p>
  </header>

  <section id="terms" class="legal-section">
    <h2>{$t("legal.terms.title")}</h2>
    <p>{$t("legal.terms.body")}</p>
    <p>{$t("legal.contact")}</p>
  </section>

  <section id="privacy" class="legal-section">
    <h2>{$t("legal.privacy.title")}</h2>
    <p>{$t("legal.privacy.body")}</p>
  </section>

  <section id="cookies" class="legal-section">
    <h2>{$t("legal.cookies.title")}</h2>
    <p>{$t("legal.cookies.body")}</p>
  </section>

  <section id="data-protection" class="legal-section">
    <h2>{$t("legal.dataProtection.title")}</h2>
    <p>{$t("legal.dataProtection.body")}</p>
  </section>
</div>

<style>
  .legal-page {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .legal-header h1 {
    margin: 0 0 0.5rem;
  }

  .legal-header p {
    margin: 0.25rem 0;
    color: var(--text-muted);
  }

  .legal-section {
    padding: 1.5rem;
    border-radius: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .legal-section h2 {
    margin: 0;
  }

  .legal-section p {
    margin: 0;
    color: var(--text-secondary);
  }
</style>
