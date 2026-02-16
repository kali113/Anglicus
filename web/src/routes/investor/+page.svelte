<script lang="ts">
  import { onMount } from "svelte";
  import { getFunnelMetrics, type FunnelMetrics } from "$lib/analytics/index.js";

  let metrics = $state<FunnelMetrics | null>(null);
  let isLoading = $state(true);
  let errorMessage = $state("");

  onMount(async () => {
    try {
      metrics = await getFunnelMetrics(30);
      if (!metrics) {
        errorMessage =
          "No analytics data yet or auth missing. / Aún no hay datos analíticos o falta autenticación.";
      }
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Could not load analytics. / No se pudieron cargar los analíticos.";
    } finally {
      isLoading = false;
    }
  });
</script>

<section class="investor-page">
  <header>
    <h1>Investor Metrics / Métricas para Inversores</h1>
    <p>Last 30 days funnel from real app events. / Embudo de 30 días con eventos reales.</p>
  </header>

  {#if isLoading}
    <p>Loading... / Cargando...</p>
  {:else if errorMessage}
    <p class="error">{errorMessage}</p>
  {:else if metrics}
    <div class="grid">
      <article class="card">
        <h3>Signup completed</h3>
        <strong>{metrics.totals.signup_completed}</strong>
      </article>
      <article class="card">
        <h3>Onboarding completed</h3>
        <strong>{metrics.totals.onboarding_completed}</strong>
      </article>
      <article class="card">
        <h3>First activation action</h3>
        <strong>{metrics.totals.activation_first_action}</strong>
      </article>
      <article class="card">
        <h3>Paywall shown</h3>
        <strong>{metrics.totals.paywall_shown}</strong>
      </article>
      <article class="card">
        <h3>Payment initiated</h3>
        <strong>{metrics.totals.payment_initiated}</strong>
      </article>
      <article class="card">
        <h3>Payment confirmed</h3>
        <strong>{metrics.totals.payment_confirmed}</strong>
      </article>
      <article class="card">
        <h3>Reactivation nudges shown</h3>
        <strong>{metrics.totals.reactivation_nudge_shown}</strong>
      </article>
    </div>

    <div class="grid conversion">
      <article class="card">
        <h3>Onboarding from signup</h3>
        <strong>{metrics.conversion.onboardingFromSignup}%</strong>
      </article>
      <article class="card">
        <h3>Activation from onboarding</h3>
        <strong>{metrics.conversion.activationFromOnboarding}%</strong>
      </article>
      <article class="card">
        <h3>Payment from paywall</h3>
        <strong>{metrics.conversion.paymentFromPaywall}%</strong>
      </article>
    </div>
  {/if}
</section>

<style>
  .investor-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.75rem;
  }

  .card h3 {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .card strong {
    font-size: 1.5rem;
  }

  .error {
    color: #fca5a5;
  }
</style>
