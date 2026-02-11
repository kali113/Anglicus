<script lang="ts">
  import { t } from "$lib/i18n";

  interface Wallet {
    key: string;
    name: string;
    ticker: string;
    address: string;
    explorer: string;
  }

  interface Props {
    variant?: "full" | "compact";
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
    class?: string;
  }

  let {
    variant = "full",
    title,
    subtitle,
    ctaLabel,
    class: className = "",
  }: Props = $props();

  const resolvedTitle = $derived(title ?? $t("support.title"));
  const resolvedSubtitle = $derived(subtitle ?? $t("support.subtitle"));
  const resolvedCtaLabel = $derived(ctaLabel ?? $t("support.cta"));

  const wallets: Wallet[] = [
    {
      key: "eth",
      name: "Ethereum",
      ticker: "ETH",
      address: "0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7",
      explorer:
        "https://etherscan.io/address/0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7",
    },
    {
      key: "btc",
      name: "Bitcoin",
      ticker: "BTC",
      address: "bc1qnk5zfsu7pzm3suf88qnpxu36pkx0vscnq04qeg",
      explorer:
        "https://mempool.space/address/bc1qnk5zfsu7pzm3suf88qnpxu36pkx0vscnq04qeg",
    },
    {
      key: "bnb",
      name: "BNB Chain",
      ticker: "BNB",
      address: "0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7",
      explorer:
        "https://bscscan.com/address/0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7",
    },
    {
      key: "sol",
      name: "Solana",
      ticker: "SOL",
      address: "H9WXRbYgizvGA3B2gywupwdwreocGoexu7YeLMdYPAZ8",
      explorer:
        "https://solscan.io/account/H9WXRbYgizvGA3B2gywupwdwreocGoexu7YeLMdYPAZ8",
    },
  ];

  let copiedKey = $state<string | null>(null);
  let expanded = $state(true);

  const qrSize = $derived(variant === "compact" ? 88 : 120);

  const buildQrUrl = (address: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(
      address,
    )}`;

  async function copyAddress(wallet: Wallet) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(wallet.address);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = wallet.address;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      copiedKey = wallet.key;
      setTimeout(() => {
        if (copiedKey === wallet.key) copiedKey = null;
      }, 2000);
    } catch {
      copiedKey = null;
    }
  }
</script>

<section class="support-card {variant} {className}">
  <div class="support-header">
    <button
      class="support-button"
      type="button"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      {resolvedCtaLabel}
      <span class="toggle">
        {expanded ? $t("support.hide") : $t("support.show")}
      </span>
    </button>
    <div class="support-title">{resolvedTitle}</div>
    <p class="support-subtitle">{resolvedSubtitle}</p>
  </div>

  {#if expanded}
    <div class="wallet-grid">
      {#each wallets as wallet}
        <div class="wallet-card">
          <div class="wallet-header">
            <span class="wallet-name">{wallet.name}</span>
            <span class="wallet-ticker">{wallet.ticker}</span>
          </div>
          <img
            class="wallet-qr"
            src={buildQrUrl(wallet.address)}
            alt={$t("support.qrAlt", { ticker: wallet.ticker })}
            loading="lazy"
            style="width: {qrSize}px; height: {qrSize}px;"
          />
          <div class="wallet-address">{wallet.address}</div>
          <div class="wallet-actions">
            <button type="button" onclick={() => copyAddress(wallet)}>
              {copiedKey === wallet.key
                ? $t("support.copied")
                : $t("support.copy")}
            </button>
            <a href={wallet.explorer} target="_blank" rel="noreferrer">
              {$t("support.verify")}
            </a>
          </div>
        </div>
      {/each}
    </div>
    <p class="support-footnote">
      {$t("support.footnote")}
    </p>
  {/if}
</section>

<style>
  .support-card {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 18px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: #f8fafc;
  }

  .support-card.compact {
    padding: 1rem;
    gap: 0.75rem;
  }

  .support-header {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .support-button {
    align-self: flex-start;
    background: linear-gradient(135deg, #fbbf24, #f97316);
    border: none;
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    font-weight: 700;
    color: #0f172a;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .support-button .toggle {
    font-size: 0.75rem;
    color: rgba(15, 23, 42, 0.7);
  }

  .support-title {
    font-size: 1.05rem;
    font-weight: 700;
  }

  .support-subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.75);
  }

  .wallet-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
  }

  .wallet-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 14px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .wallet-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .wallet-name {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .wallet-ticker {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  .wallet-qr {
    align-self: center;
    border-radius: 10px;
    background: #fff;
    padding: 0.2rem;
  }

  .wallet-address {
    font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.72rem;
    word-break: break-all;
    color: #f1f5f9;
  }

  .wallet-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: center;
  }

  .wallet-actions button {
    background: rgba(45, 212, 191, 0.15);
    border: 1px solid rgba(45, 212, 191, 0.3);
    color: #5eead4;
    border-radius: 8px;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .wallet-actions a {
    color: #93c5fd;
    text-decoration: none;
    font-size: 0.75rem;
  }

  .wallet-actions a:hover {
    text-decoration: underline;
  }

  .support-footnote {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(226, 232, 240, 0.7);
  }

  @media (max-width: 720px) {
    .support-card {
      padding: 1rem;
    }

    .wallet-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
