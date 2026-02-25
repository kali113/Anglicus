<script lang="ts">
  import { base } from "$app/paths";
  import { getUserProfile } from "$lib/storage/user-store.js";
  import {
    type BillingCheckoutRailOption,
    createCheckoutSession,
    getCheckoutSessionStatus,
    getPaymentConfig,
    refreshPaymentStatus,
    type BillingCheckoutSession,
    type BillingPaymentConfig,
    type CheckoutAsset,
    type CheckoutNetwork,
  } from "$lib/billing/index.js";
  import SupportCryptoCard from "$lib/components/SupportCryptoCard.svelte";
  import { t } from "$lib/i18n";

  interface $$Props {
    open?: boolean;
    mode?: "nag" | "block";
    featureLabel?: string;
    onclose?: () => void;
    onpaid?: (payload: { paidUntil?: string }) => void;
  }

  let {
    open = false,
    mode = "block",
    featureLabel,
    onclose,
    onpaid,
  } = $props();

  const resolvedFeatureLabel = $derived(
    featureLabel ?? $t("paywall.featureDefault"),
  );

  const CHECKOUT_POLL_MS = 15_000;

  let config = $state<BillingPaymentConfig | null>(null);
  let checkoutSession = $state<BillingCheckoutSession | null>(null);
  let isLoading = $state(false);
  let isCreatingSession = $state(false);
  let errorMessage = $state("");
  let statusMessage = $state("");
  let isCheckingStatus = $state(false);
  let hasNotifiedPaid = $state(false);
  let billing = $state<any>(undefined);
  let selectedAsset = $state<CheckoutAsset | null>(null);
  let selectedNetwork = $state<CheckoutNetwork | null>(null);
  let checkoutInterval: ReturnType<typeof window.setInterval> | null = null;

  $effect(() => {
    if (!open) {
      stopCheckoutPolling();
      checkoutSession = null;
      hasNotifiedPaid = false;
      return;
    }

    void initializeCheckoutFlow();

    return () => {
      stopCheckoutPolling();
    };
  });

  async function initializeCheckoutFlow() {
    const profile = await getUserProfile();
    billing = profile?.billing;

    const loadedConfig = await loadConfig();
    if (!loadedConfig) return;
    ensureRailSelection(loadedConfig);
    await loadCheckoutSession();
  }

  function getFallbackBtcRail(): BillingCheckoutRailOption {
    return {
      asset: "btc",
      network: "bitcoin",
      symbol: "sats",
      label: "Bitcoin (BTC)",
    };
  }

  function getCheckoutRails(cfg: BillingPaymentConfig | null = config): BillingCheckoutRailOption[] {
    if (cfg?.checkoutRails?.length) return cfg.checkoutRails;
    if (cfg) return [getFallbackBtcRail()];
    return [];
  }

  function getAssetOptions(): CheckoutAsset[] {
    return [...new Set(getCheckoutRails().map((rail) => rail.asset))];
  }

  function getNetworkOptions(asset: CheckoutAsset | null): CheckoutNetwork[] {
    if (!asset) return [];
    return getCheckoutRails()
      .filter((rail) => rail.asset === asset)
      .map((rail) => rail.network);
  }

  function ensureRailSelection(cfg: BillingPaymentConfig): void {
    const rails = getCheckoutRails(cfg);
    if (rails.length === 0) {
      selectedAsset = null;
      selectedNetwork = null;
      return;
    }
    const assets = [...new Set(rails.map((rail) => rail.asset))];
    if (!selectedAsset || !assets.includes(selectedAsset)) {
      selectedAsset = assets[0] ?? null;
    }
    const networks = getNetworkOptions(selectedAsset);
    if (!selectedNetwork || !networks.includes(selectedNetwork)) {
      selectedNetwork = networks[0] ?? null;
    }
  }

  async function loadConfig(): Promise<BillingPaymentConfig | null> {
    if (config) return config;
    if (isLoading) return null;
    isLoading = true;
    errorMessage = "";
    try {
      config = await getPaymentConfig();
      return config;
    } catch (err) {
      errorMessage = $t("paywall.loadError");
      return null;
    } finally {
      isLoading = false;
    }
  }

  async function loadCheckoutSession() {
    if (checkoutSession || isCreatingSession) return;
    if (!selectedAsset || !selectedNetwork) {
      if (config) ensureRailSelection(config);
      if (!selectedAsset || !selectedNetwork) return;
    }

    isCreatingSession = true;
    errorMessage = "";
    statusMessage = "";
    try {
      checkoutSession = await createCheckoutSession({
        asset: selectedAsset,
        network: selectedNetwork,
      });
      selectedAsset = checkoutSession.asset;
      selectedNetwork = checkoutSession.network;
      await checkCheckoutSessionStatus(true);
      startCheckoutPolling();
    } catch (err) {
      errorMessage =
        err instanceof Error
          ? err.message
          : $t("paywall.verifyError");
    } finally {
      isCreatingSession = false;
    }
  }

  async function reloadCheckoutSessionForSelection() {
    stopCheckoutPolling();
    checkoutSession = null;
    statusMessage = "";
    errorMessage = "";
    await loadCheckoutSession();
  }

  async function handleAssetChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as CheckoutAsset;
    selectedAsset = value;
    const networks = getNetworkOptions(selectedAsset);
    if (!selectedNetwork || !networks.includes(selectedNetwork)) {
      selectedNetwork = networks[0] ?? null;
    }
    await reloadCheckoutSessionForSelection();
  }

  async function handleNetworkChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as CheckoutNetwork;
    selectedNetwork = value;
    await reloadCheckoutSessionForSelection();
  }

  function startCheckoutPolling() {
    if (!open || !checkoutSession) return;
    stopCheckoutPolling();
    checkoutInterval = window.setInterval(() => {
      void checkCheckoutSessionStatus(true);
    }, CHECKOUT_POLL_MS);
  }

  function stopCheckoutPolling() {
    if (checkoutInterval) {
      clearInterval(checkoutInterval);
      checkoutInterval = null;
    }
  }

  function notifyPaid(paidUntil?: string) {
    if (hasNotifiedPaid) return;
    hasNotifiedPaid = true;
    onpaid?.({ paidUntil });
  }

  async function checkCheckoutSessionStatus(isBackground = false) {
    if (!checkoutSession || isCheckingStatus) return;
    isCheckingStatus = true;
    if (!isBackground) {
      statusMessage = "";
      errorMessage = "";
    }

    try {
      const result = await getCheckoutSessionStatus(checkoutSession.sessionId);
      const profile = await getUserProfile();
      billing = profile?.billing;

      if (result.status === "confirmed") {
        statusMessage = $t("paywall.confirmed");
        notifyPaid(result.paidUntil);
        stopCheckoutPolling();
      } else if (result.status === "pending_confirming") {
        statusMessage = $t("paywall.pending");
      } else if (result.status === "awaiting_payment") {
        statusMessage = $t("paywall.awaitingPayment");
      } else if (result.status === "underpaid") {
        statusMessage = $t("paywall.underpaid", {
          paid: result.paidAmount ?? "0",
          required: result.requiredAmount,
          symbol: result.symbol,
        });
      } else if (result.status === "expired") {
        statusMessage = $t("paywall.sessionExpired");
        stopCheckoutPolling();
      } else if (result.status === "verification_delayed") {
        statusMessage = $t("paywall.verificationDelayed");
      } else if (result.status === "reorg_review") {
        statusMessage = $t("paywall.reorgReview");
      } else {
        statusMessage = $t("paywall.pending");
      }
    } catch (err) {
      if (!isBackground) {
        errorMessage =
          err instanceof Error
            ? err.message
            : $t("paywall.verifyError");
      }
    } finally {
      isCheckingStatus = false;
    }
  }

  async function handleCheckPaymentStatus() {
    await checkCheckoutSessionStatus(false);
    await refreshPaymentStatus();
  }

  async function handleRetryCheckoutFlow() {
    if (isLoading || isCreatingSession || isCheckingStatus) return;
    stopCheckoutPolling();
    checkoutSession = null;
    errorMessage = "";
    statusMessage = "";
    await initializeCheckoutFlow();
  }

  function closeModal() {
    stopCheckoutPolling();
    onclose?.();
  }

  function getRequiredAmountText(): string | null {
    if (checkoutSession) {
      return `${checkoutSession.requiredAmount} ${checkoutSession.symbol}`;
    }
    if (!config) return null;
    if (selectedAsset && selectedAsset !== "btc") return null;
    const discount = billing?.discountPercent ?? 0;
    const requiredSats = !discount
      ? config.minSats
      : Math.max(1, Math.round(config.minSats * (1 - discount / 100)));
    return `${requiredSats.toLocaleString()} sats`;
  }

  function getSubscriptionDays(): number | null {
    if (checkoutSession) return checkoutSession.subscriptionDays;
    if (!config) return null;
    return config.subscriptionDays;
  }
</script>

{#if open}
  <div
    class="paywall-backdrop"
    role="button"
    tabindex="0"
    aria-label={$t("common.close")}
    onclick={(e) => e.currentTarget === e.target && closeModal()}
    onkeydown={(e) =>
      (e.key === "Escape" || e.key === "Enter" || e.key === " ") &&
      closeModal()}
  >
    <div class="paywall-card" role="dialog" aria-modal="true">
      <header>
        <div class="header-row">
          <h2>{$t("paywall.title")}</h2>
          <button class="close-icon" type="button" onclick={closeModal} aria-label={$t("common.close")}>
            ×
          </button>
        </div>
        <p class="subtitle">
          {mode === "nag"
            ? $t("paywall.subtitleNag", { feature: resolvedFeatureLabel })
            : $t("paywall.subtitleBlock", { feature: resolvedFeatureLabel })}
        </p>
      </header>

      <div class="benefits">
        <div>{$t("paywall.benefitTutor")}</div>
        <div>{$t("paywall.benefitExplanations")}</div>
        <div>{$t("paywall.benefitQuickChat")}</div>
      </div>

      <div class="pricing">
        {#if isLoading || isCreatingSession}
          <span>{$t("paywall.loadingPrice")}</span>
        {:else if config || checkoutSession}
          <div class="price-row">
            {#if getRequiredAmountText()}
              <span class="price">{getRequiredAmountText()}</span>
            {:else}
              <span>{$t("paywall.loadingPrice")}</span>
            {/if}
            {#if getSubscriptionDays()}
              <span class="period">
                {$t("paywall.period", { days: getSubscriptionDays() ?? 0 })}
              </span>
            {/if}
          </div>
          {#if config?.priceUsd}
            <div class="usd">≈ ${config.priceUsd} USD</div>
          {/if}
          {#if billing?.discountPercent && billing?.discountSource === "promo"}
            <div class="discount">
              {$t("paywall.discountPromoApplied", { percent: billing.discountPercent })}
            </div>
          {:else if billing?.discountPercent && billing?.discountSource === "referral"}
            <div class="discount">
              {$t("paywall.discountReferralApplied", { percent: billing.discountPercent })}
            </div>
          {/if}
        {/if}
      </div>

      <div class="payment-box">
        {#if errorMessage}
          <div class="error">{errorMessage}</div>
        {/if}
        {#if statusMessage}
          <div class="status">{statusMessage}</div>
        {/if}

        {#if getCheckoutRails().length > 0}
          <div class="selectors">
            <label class="selector">
              <span>{$t("paywall.assetLabel")}</span>
              <select
                value={selectedAsset ?? ""}
                onchange={handleAssetChange}
                disabled={isCreatingSession || isCheckingStatus}
              >
                {#each getAssetOptions() as asset}
                  <option value={asset}>{$t(`paywall.asset.${asset}`)}</option>
                {/each}
              </select>
            </label>
            <label class="selector">
              <span>{$t("paywall.networkLabel")}</span>
              <select
                value={selectedNetwork ?? ""}
                onchange={handleNetworkChange}
                disabled={isCreatingSession || isCheckingStatus || getNetworkOptions(selectedAsset).length <= 1}
              >
                {#each getNetworkOptions(selectedAsset) as network}
                  <option value={network}>{$t(`paywall.network.${network}`)}</option>
                {/each}
              </select>
            </label>
          </div>
        {/if}

        {#if checkoutSession}
          <div class="address-block">
            <div class="label">
              {$t("paywall.sendCrypto", {
                symbol: checkoutSession.symbol,
                network: $t(`paywall.network.${checkoutSession.network}`),
              })}
            </div>
            <div class="address">{checkoutSession.address}</div>
          </div>
          <div class="session-meta">
            {$t("paywall.sessionExpires", { at: new Date(checkoutSession.expiresAt).toLocaleString() })}
          </div>
          <div class="session-meta disclaimer">
            {$t("paywall.checkoutDisclaimer")}
          </div>
          <div class="tx-check-row">
            <button
              class="secondary check-btn"
              type="button"
              onclick={handleCheckPaymentStatus}
              disabled={isCheckingStatus}
            >
              {isCheckingStatus ? $t("paywall.checkingStatus") : $t("paywall.checkStatus")}
            </button>
          </div>
        {:else if isCreatingSession}
          <div class="session-meta">{$t("paywall.loadingCheckoutSession")}</div>
        {:else}
          {#if !errorMessage}
            <div class="session-meta">{$t("paywall.checkoutUnavailable")}</div>
          {/if}
          <div class="tx-check-row">
            <button
              class="secondary check-btn"
              type="button"
              onclick={handleRetryCheckoutFlow}
              disabled={isLoading || isCreatingSession || isCheckingStatus}
            >
              {$t("common.retry")}
            </button>
          </div>
        {/if}

      </div>

      <div class="crypto-support">
        <p class="crypto-note">
          {$t("paywall.cryptoNote")}
        </p>
        <SupportCryptoCard
          variant="compact"
          title={$t("support.compactTitle")}
          subtitle={$t("support.compactSubtitle")}
        />
      </div>

      <div class="byok-tip">
        {$t("paywall.byok")}
        <a href={`${base}/settings`}>{$t("paywall.byokLink")}</a>
      </div>

      <footer>
        <button class="secondary" onclick={closeModal}>
          {mode === "nag" ? $t("paywall.keepFree") : $t("common.close")}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .paywall-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.75);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 1200;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .paywall-card {
    max-width: 520px;
    width: 100%;
    max-height: min(92vh, 820px);
    overflow: auto;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 24px;
    padding: 1.5rem;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4);
  }

  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .close-icon {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(148, 163, 184, 0.12);
    color: #e2e8f0;
    font-size: 1.2rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .subtitle {
    margin: 0;
    color: rgba(248, 250, 252, 0.7);
    font-size: 0.95rem;
  }

  .benefits {
    display: grid;
    gap: 0.4rem;
    font-size: 0.95rem;
    color: rgba(248, 250, 252, 0.9);
  }

  .pricing {
    background: rgba(30, 41, 59, 0.7);
    border-radius: 12px;
    padding: 0.9rem 1rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .price-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .price {
    font-size: 1.6rem;
    font-weight: 700;
    color: #2dd4bf;
  }

  .period,
  .usd {
    color: rgba(226, 232, 240, 0.7);
    font-size: 0.85rem;
  }

  .discount {
    margin-top: 0.35rem;
    color: #facc15;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .payment-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .selectors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .selector {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: rgba(226, 232, 240, 0.78);
  }

  .selector select {
    width: 100%;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #f8fafc;
    border-radius: 9px;
    padding: 0.5rem 0.6rem;
    font-size: 0.88rem;
  }

  .selector select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .address-block {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    padding: 0.75rem;
  }

  .address {
    font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.85rem;
    word-break: break-all;
    color: #f8fafc;
  }

  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(226, 232, 240, 0.6);
    margin-bottom: 0.35rem;
  }

  .session-meta {
    font-size: 0.8rem;
    color: rgba(226, 232, 240, 0.75);
    line-height: 1.4;
  }

  .session-meta.disclaimer {
    border-left: 2px solid rgba(250, 204, 21, 0.6);
    padding-left: 0.6rem;
  }

  .tx-check-row {
    display: flex;
    justify-content: flex-end;
  }

  .check-btn {
    padding: 0.45rem 0.85rem;
    font-size: 0.85rem;
  }

  .error {
    background: rgba(248, 113, 113, 0.15);
    color: #fca5a5;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    font-size: 0.85rem;
  }

  .status {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    font-size: 0.85rem;
  }

  .byok-tip {
    font-size: 0.8rem;
    color: rgba(226, 232, 240, 0.7);
  }

  .crypto-support {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .crypto-note {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.75);
  }

  .byok-tip a {
    color: #2dd4bf;
    text-decoration: underline;
  }

  footer {
    display: flex;
    justify-content: flex-end;
  }

  .secondary {
    background: rgba(148, 163, 184, 0.15);
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #e2e8f0;
    padding: 0.6rem 1rem;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .paywall-backdrop {
      padding: 0.75rem;
    }

    .selectors {
      grid-template-columns: 1fr;
    }
  }
</style>
