<script lang="ts">
  import { base } from "$app/paths";
  import { getUserProfile } from "$lib/storage/user-store.js";
  import {
    getPaymentConfig,
    verifyPayment,
    type BillingPaymentConfig,
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

  let config = $state<BillingPaymentConfig | null>(null);
  let isLoading = $state(false);
  let errorMessage = $state("");
  let txId = $state("");
  let statusMessage = $state("");
  let isVerifying = $state(false);
  let billing = $state<any>(undefined);

  $effect(() => {
    if (open) {
      getUserProfile().then((p) => { billing = p?.billing; });
      loadConfig();
    }
  });

  async function loadConfig() {
    if (config || isLoading) return;
    isLoading = true;
    errorMessage = "";
    try {
      config = await getPaymentConfig();
    } catch (err) {
      errorMessage = $t("paywall.loadError");
    } finally {
      isLoading = false;
    }
  }

  async function handleVerify() {
    if (!txId.trim() || isVerifying) return;
    isVerifying = true;
    statusMessage = "";
    errorMessage = "";

    try {
      const result = await verifyPayment(txId.trim());
      if (result.status === "confirmed") {
        statusMessage = $t("paywall.confirmed");
        onpaid?.({ paidUntil: result.paidUntil });
      } else {
        statusMessage = $t("paywall.pending");
      }
    } catch (err) {
      errorMessage =
        err instanceof Error
          ? err.message
          : $t("paywall.verifyError");
    } finally {
      isVerifying = false;
    }
  }

  function closeModal() {
    onclose?.();
  }

  function getRequiredSats(): number | null {
    if (!config) return null;
    const discount = billing?.discountPercent ?? 0;
    if (!discount) return config.minSats;
    return Math.max(1, Math.round(config.minSats * (1 - discount / 100)));
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
        <h2>{$t("paywall.title")}</h2>
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
        {#if isLoading}
          <span>{$t("paywall.loadingPrice")}</span>
        {:else if config}
          <div class="price-row">
            <span class="price">
              {getRequiredSats()?.toLocaleString()} sats
            </span>
            <span class="period">
              {$t("paywall.period", { days: config.subscriptionDays })}
            </span>
          </div>
          {#if config.priceUsd}
            <div class="usd">≈ ${config.priceUsd} USD</div>
          {/if}
          {#if billing?.discountPercent}
            <div class="discount">
              {$t("paywall.discountApplied", { percent: billing.discountPercent })}
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

        {#if config}
          <div class="address-block">
            <div class="label">
              {$t("paywall.sendBtc", {
                network: $t(`paywall.network.${config.network}`),
              })}
            </div>
            <div class="address">{config.address}</div>
          </div>

          <div class="tx-input">
            <input
              type="text"
              placeholder={$t("paywall.txPlaceholder")}
              bind:value={txId}
            />
            <button onclick={handleVerify} disabled={isVerifying || !txId.trim()}>
              {isVerifying ? $t("paywall.verifying") : $t("paywall.verify")}
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
    align-items: center;
    justify-content: center;
    z-index: 1200;
    padding: 1.5rem;
  }

  .paywall-card {
    max-width: 520px;
    width: 100%;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 18px;
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

  .tx-input {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tx-input input {
    flex: 1;
    min-width: 200px;
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.7);
    color: #f8fafc;
  }

  .tx-input button {
    padding: 0.6rem 1rem;
    border-radius: 10px;
    border: none;
    background: #2dd4bf;
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
  }

  .tx-input button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
</style>
