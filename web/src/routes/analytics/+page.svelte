<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { AuthRequestError, getToken } from "$lib/auth/index.js";
  import {
    fetchAnalyticsDashboard,
    type AnalyticsDashboardPayload,
  } from "$lib/analytics/dashboard.js";
  import { t } from "$lib/i18n";

  const WINDOW_OPTIONS = [7, 30, 90] as const;

  let dashboardWindow = $state<(typeof WINDOW_OPTIONS)[number]>(30);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let errorMessage = $state("");
  let data = $state<AnalyticsDashboardPayload | null>(null);

  const trendMax = $derived.by(() => {
    if (!data || data.trends.length === 0) return 1;
    return Math.max(
      ...data.trends.map((item) =>
        Math.max(
          item.pageViews,
          item.signupStarted,
          item.signupCompleted,
          item.paymentConfirmed,
        ),
      ),
      1,
    );
  });

  const latestTimestamp = $derived.by(() => {
    if (!data?.generatedAt) return "-";
    const parsed = new Date(data.generatedAt);
    if (Number.isNaN(parsed.getTime())) return data.generatedAt;
    return parsed.toLocaleString();
  });

  onMount(async () => {
    if (!getToken()) {
      window.location.replace(`${base}/login`);
      return;
    }

    await loadDashboard(false);
  });

  async function loadDashboard(isManualRefresh: boolean): Promise<void> {
    if (isManualRefresh) {
      isRefreshing = true;
    } else {
      isLoading = true;
    }

    errorMessage = "";

    try {
      data = await fetchAnalyticsDashboard(dashboardWindow);
    } catch (error) {
      if (error instanceof AuthRequestError) {
        if (error.status === 401) {
          window.location.replace(`${base}/login`);
          return;
        }
        if (error.status === 403) {
          errorMessage = $t("analytics.accessDenied");
        } else if (error.status === 503) {
          errorMessage = $t("analytics.notConfigured");
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = error instanceof Error ? error.message : $t("analytics.loadError");
      }
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  async function selectWindow(days: (typeof WINDOW_OPTIONS)[number]): Promise<void> {
    if (dashboardWindow === days) return;
    dashboardWindow = days;
    await loadDashboard(false);
  }

  function formatCount(value: number): string {
    return Intl.NumberFormat().format(value || 0);
  }

  function formatRate(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  function barHeight(value: number): string {
    const normalized = Math.max(6, Math.round((value / trendMax) * 100));
    return `${normalized}%`;
  }
</script>

<div class="analytics-page">
  <header class="header">
    <div>
      <p class="eyebrow">{$t("analytics.eyebrow")}</p>
      <h1>{$t("analytics.title")}</h1>
      <p class="subtitle">{$t("analytics.subtitle")}</p>
    </div>
    <div class="controls">
      <div class="range-buttons">
        {#each WINDOW_OPTIONS as option}
          <button
            type="button"
            class:active={dashboardWindow === option}
            onclick={() => selectWindow(option)}
          >
            {$t("analytics.rangeDays", { days: option })}
          </button>
        {/each}
      </div>
      <button type="button" class="refresh-btn" onclick={() => loadDashboard(true)}>
        {#if isRefreshing}
          {$t("analytics.refreshing")}
        {:else}
          {$t("analytics.refresh")}
        {/if}
      </button>
    </div>
  </header>

  {#if isLoading}
    <div class="loading">{$t("common.loading")}</div>
  {:else if errorMessage}
    <section class="error-state">
      <p>{errorMessage}</p>
      <button type="button" onclick={() => loadDashboard(true)}>{$t("common.retry")}</button>
    </section>
  {:else if data}
    <p class="timestamp">
      {$t("analytics.lastUpdated", { date: latestTimestamp })}
    </p>

    <section class="kpi-grid">
      <article class="kpi-card">
        <p>{$t("analytics.kpi.pageViews")}</p>
        <h3>{formatCount(data.totals.pageViews)}</h3>
      </article>
      <article class="kpi-card">
        <p>{$t("analytics.kpi.uniqueVisitors")}</p>
        <h3>{formatCount(data.totals.uniqueVisitors)}</h3>
      </article>
      <article class="kpi-card">
        <p>{$t("analytics.kpi.signupCompleted")}</p>
        <h3>{formatCount(data.totals.signupCompleted)}</h3>
      </article>
      <article class="kpi-card">
        <p>{$t("analytics.kpi.paymentConfirmed")}</p>
        <h3>{formatCount(data.totals.paymentConfirmed)}</h3>
      </article>
    </section>

    <section class="panel funnel-panel">
      <h2>{$t("analytics.funnel.title")}</h2>
      <div class="funnel-grid">
        <div>
          <span>{$t("analytics.funnel.signupCompletion")}</span>
          <strong>{formatRate(data.funnel.signupCompletionRate)}</strong>
        </div>
        <div>
          <span>{$t("analytics.funnel.onboarding")}</span>
          <strong>{formatRate(data.funnel.onboardingRate)}</strong>
        </div>
        <div>
          <span>{$t("analytics.funnel.paywallToCheckout")}</span>
          <strong>{formatRate(data.funnel.paywallToCheckoutRate)}</strong>
        </div>
        <div>
          <span>{$t("analytics.funnel.checkoutToPayment")}</span>
          <strong>{formatRate(data.funnel.checkoutToPaymentRate)}</strong>
        </div>
        <div>
          <span>{$t("analytics.funnel.paywallToPayment")}</span>
          <strong>{formatRate(data.funnel.paywallToPaymentRate)}</strong>
        </div>
      </div>
    </section>

    <section class="panel trend-panel">
      <h2>{$t("analytics.trend.title")}</h2>
      <div class="trend-chart">
        {#each data.trends as trend}
          <div class="trend-col" title={trend.day}>
            <div class="bar-wrap">
              <div class="bar views" style="height: {barHeight(trend.pageViews)}"></div>
              <div class="bar signups" style="height: {barHeight(trend.signupCompleted)}"></div>
              <div class="bar payments" style="height: {barHeight(trend.paymentConfirmed)}"></div>
            </div>
            <span>{trend.day.slice(5)}</span>
          </div>
        {/each}
      </div>
      <div class="legend">
        <span><i class="views"></i>{$t("analytics.legend.pageViews")}</span>
        <span><i class="signups"></i>{$t("analytics.legend.signups")}</span>
        <span><i class="payments"></i>{$t("analytics.legend.payments")}</span>
      </div>
    </section>

    <section class="list-grid">
      <article class="panel">
        <h2>{$t("analytics.topPages")}</h2>
        <ol>
          {#each data.topPages as item}
            <li>
              <span>{item.label}</span>
              <strong>{formatCount(item.count)}</strong>
            </li>
          {:else}
            <li class="empty">{$t("analytics.noData")}</li>
          {/each}
        </ol>
      </article>

      <article class="panel">
        <h2>{$t("analytics.topReferrers")}</h2>
        <ol>
          {#each data.topReferrers as item}
            <li>
              <span>{item.label}</span>
              <strong>{formatCount(item.count)}</strong>
            </li>
          {:else}
            <li class="empty">{$t("analytics.noData")}</li>
          {/each}
        </ol>
      </article>

      <article class="panel">
        <h2>{$t("analytics.topCampaigns")}</h2>
        <ol>
          {#each data.topCampaigns as item}
            <li>
              <span>{item.label}</span>
              <strong>{formatCount(item.count)}</strong>
            </li>
          {:else}
            <li class="empty">{$t("analytics.noData")}</li>
          {/each}
        </ol>
      </article>

      <article class="panel">
        <h2>{$t("analytics.eventMixWeb")}</h2>
        <ol>
          {#each data.eventMix.web as item}
            <li>
              <span>{item.label}</span>
              <strong>{formatCount(item.count)}</strong>
            </li>
          {:else}
            <li class="empty">{$t("analytics.noData")}</li>
          {/each}
        </ol>
      </article>

      <article class="panel">
        <h2>{$t("analytics.eventMixProduct")}</h2>
        <ol>
          {#each data.eventMix.product as item}
            <li>
              <span>{item.label}</span>
              <strong>{formatCount(item.count)}</strong>
            </li>
          {:else}
            <li class="empty">{$t("analytics.noData")}</li>
          {/each}
        </ol>
      </article>
    </section>
  {/if}
</div>

<style>
  .analytics-page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5eead4;
    font-size: 0.78rem;
    font-weight: 700;
  }

  h1 {
    margin: 0.25rem 0;
    font-size: 2rem;
  }

  .subtitle {
    margin: 0;
    color: var(--text-muted);
    max-width: 720px;
  }

  .controls {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .range-buttons {
    display: flex;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    overflow: hidden;
  }

  .range-buttons button {
    border: none;
    background: transparent;
    color: #cbd5e1;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .range-buttons button.active {
    background: rgba(20, 184, 166, 0.25);
    color: #ecfeff;
  }

  .refresh-btn {
    border-radius: 10px;
    border: 1px solid rgba(94, 234, 212, 0.5);
    background: rgba(15, 118, 110, 0.26);
    color: #ccfbf1;
    padding: 0.5rem 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .timestamp {
    margin: 0;
    color: #94a3b8;
    font-size: 0.82rem;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.9rem;
  }

  .kpi-card {
    padding: 1rem;
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: linear-gradient(140deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.9));
  }

  .kpi-card p {
    margin: 0;
    color: #94a3b8;
    font-size: 0.82rem;
  }

  .kpi-card h3 {
    margin: 0.3rem 0 0;
    font-size: 1.4rem;
  }

  .panel {
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.75);
  }

  .panel h2 {
    margin: 0 0 0.8rem;
    font-size: 1rem;
  }

  .funnel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.7rem;
  }

  .funnel-grid div {
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 10px;
    padding: 0.75rem;
    background: rgba(30, 41, 59, 0.65);
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .funnel-grid span {
    color: #cbd5e1;
    font-size: 0.85rem;
  }

  .trend-chart {
    height: 220px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(24px, 1fr));
    gap: 0.45rem;
    align-items: end;
  }

  .trend-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }

  .bar-wrap {
    width: 100%;
    min-height: 160px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
  }

  .bar {
    width: 28%;
    border-radius: 5px 5px 3px 3px;
  }

  .bar.views {
    background: #38bdf8;
  }

  .bar.signups {
    background: #fbbf24;
  }

  .bar.payments {
    background: #22c55e;
  }

  .trend-col span {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.9rem;
    color: #cbd5e1;
    font-size: 0.82rem;
  }

  .legend span {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .legend i {
    width: 10px;
    height: 10px;
    display: inline-block;
    border-radius: 2px;
  }

  .legend i.views {
    background: #38bdf8;
  }

  .legend i.signups {
    background: #fbbf24;
  }

  .legend i.payments {
    background: #22c55e;
  }

  .list-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.9rem;
  }

  ol {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  li {
    display: flex;
    justify-content: space-between;
    gap: 0.7rem;
    color: #cbd5e1;
    font-size: 0.86rem;
  }

  li span {
    overflow-wrap: anywhere;
  }

  .empty {
    color: #94a3b8;
    list-style: none;
    padding-left: 0;
  }

  .error-state {
    padding: 1.25rem;
    border: 1px solid rgba(248, 113, 113, 0.4);
    border-radius: 14px;
    background: rgba(127, 29, 29, 0.18);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .error-state button {
    border: 1px solid rgba(248, 113, 113, 0.6);
    background: rgba(239, 68, 68, 0.2);
    color: #fecaca;
    border-radius: 8px;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
  }

  .loading {
    padding: 1rem;
    color: #cbd5e1;
  }
</style>
