<script lang="ts">
  import { onMount } from "svelte";
  import {
    ensureAdsenseScript,
    isAdsenseEnabled,
    markAdSlotImpression,
    shouldRenderAds,
  } from "$lib/ads/index.js";
  import type { BillingInfo } from "$lib/types/user.js";
  import { t } from "$lib/i18n";

  interface Props {
    placement: string;
    slotId: string;
    billing?: BillingInfo | null;
    minHeight?: string;
  }

  let {
    placement,
    slotId,
    billing = null,
    minHeight = "90px",
  }: Props = $props();

  let initialized = $state(false);
  let mounted = $state(false);

  const shouldShow = $derived(
    Boolean(slotId) && isAdsenseEnabled() && shouldRenderAds(billing),
  );

  onMount(() => {
    mounted = true;
  });

  $effect(() => {
    if (!mounted || !shouldShow || initialized) return;

    let cancelled = false;

    const initialize = async () => {
      const loaded = await ensureAdsenseScript();
      if (!loaded || cancelled) return;

      try {
        const adsQueue =
          window.adsbygoogle || (window.adsbygoogle = []);
        adsQueue.push({});
        initialized = true;
        void markAdSlotImpression(placement);
      } catch (error) {
        console.error("Ad slot initialization failed:", error);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  });
</script>

{#if shouldShow}
  <aside
    class="ad-slot"
    aria-label={$t("ads.sponsored")}
    data-placement={placement}
  >
    <p class="ad-label">{$t("ads.sponsored")}</p>
    <ins
      class="adsbygoogle"
      style={`display:block; min-height:${minHeight};`}
      data-ad-client={import.meta.env.VITE_ADSENSE_CLIENT_ID}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
      data-adtest={import.meta.env.DEV ? "on" : undefined}
    ></ins>
  </aside>
{/if}

<style>
  .ad-slot {
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 12px;
    padding: 0.55rem;
    background: rgba(15, 23, 42, 0.45);
  }

  .ad-label {
    margin: 0 0 0.35rem;
    color: rgba(148, 163, 184, 0.9);
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
</style>
