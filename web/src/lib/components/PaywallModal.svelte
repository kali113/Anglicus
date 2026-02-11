<script lang="ts">
  import { base } from "$app/paths";
  import { getUserProfile } from "$lib/storage/user-store.js";
  import {
    getPaymentConfig,
    verifyPayment,
    type BillingPaymentConfig,
  } from "$lib/billing/index.js";

  let {
    open = false,
    mode = "block",
    featureLabel = "Tutor IA",
    onclose,
    onpaid,
  }: {
    open?: boolean;
    mode?: "nag" | "block";
    featureLabel?: string;
    onclose?: () => void;
    onpaid?: (detail: { paidUntil?: string }) => void;
  } = $props();

  let config = $state<BillingPaymentConfig | null>(null);
  let isLoading = $state(false);
  let errorMessage = $state("");
  let txId = $state("");
  let statusMessage = $state("");
  let isVerifying = $state(false);
  let billing = $state(getUserProfile()?.billing);

  $effect(() => {
    if (open) {
      billing = getUserProfile()?.billing;
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
      errorMessage =
        "No pudimos cargar la información de pago. Intenta de nuevo.";
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
        statusMessage = "Pago confirmado. Tu plan Pro está activo.";
        onpaid?.({ paidUntil: result.paidUntil });
      } else {
        statusMessage =
          "Pago pendiente. Se activará automáticamente cuando confirme la red.";
      }
    } catch (err) {
      errorMessage =
        err instanceof Error
          ? err.message
          : "No se pudo verificar el pago.";
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
  <div class="paywall-backdrop" onclick={closeModal}>
    <div class="paywall-card" onclick={(e) => e.stopPropagation()}>
      <header>
        <h2>Desbloquea Pro</h2>
        <p class="subtitle">
          {mode === "nag"
            ? `¿Quieres ir más rápido? ${featureLabel} es ilimitado en Pro.`
            : `Has alcanzado el límite gratuito para ${featureLabel}.`}
        </p>
      </header>

      <div class="benefits">
        <div>✔ Tutor IA ilimitado</div>
        <div>✔ Explicaciones y correcciones avanzadas</div>
        <div>✔ Chat rápido sin límites</div>
      </div>

      <div class="pricing">
        {#if isLoading}
          <span>Cargando precio...</span>
        {:else if config}
          <div class="price-row">
            <span class="price">
              {getRequiredSats()?.toLocaleString()} sats
            </span>
            <span class="period">/ {config.subscriptionDays} días</span>
          </div>
          {#if config.priceUsd}
            <div class="usd">≈ ${config.priceUsd} USD</div>
          {/if}
          {#if billing?.discountPercent}
            <div class="discount">
              {billing.discountPercent}% OFF aplicado
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
              Enviar BTC ({config.network === "testnet"
                ? "Testnet"
                : "Mainnet"})
            </div>
            <div class="address">{config.address}</div>
          </div>

          <div class="tx-input">
            <input
              type="text"
              placeholder="Pega el TXID aquí"
              bind:value={txId}
            />
            <button onclick={handleVerify} disabled={isVerifying || !txId.trim()}>
              {isVerifying ? "Verificando..." : "Verificar pago"}
            </button>
          </div>
        {/if}

        <div class="address-block">
          <div class="label">ETH / BNB (EVM)</div>
          <div class="address">0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7</div>
        </div>

        <div class="address-block">
          <div class="label">Solana (SOL)</div>
          <div class="address">H9WXRbYgizvGA3B2gywupwdw reocGoexu7YeLMdYPAZ8</div>
        </div>
      </div>

      <div class="byok-tip">
        BYOK siempre es gratis.
        <a href={`${base}/settings`}>Configura tu API key</a>
      </div>

      <footer>
        <button class="secondary" onclick={closeModal}>
          {mode === "nag" ? "Seguir gratis" : "Cerrar"}
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
