<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import SeoHead from "$lib/components/SeoHead.svelte";
  import type { Locale } from "$lib/i18n";
  import { translateLocale } from "$lib/seo/translate";

  const STORAGE_KEY = "anglicus_locale";

  let preferredLocale = $state<Locale>("es");

  const englishHref = `${base}/en`;
  const spanishHref = `${base}/es`;
  const redirectHref = $derived(
    preferredLocale === "es" ? spanishHref : englishHref,
  );

  const detectLocale = (): Locale => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "es") {
        return stored;
      }
    } catch {
      // Keep fallback locale if storage cannot be accessed.
    }

    const language = navigator.language?.toLowerCase() ?? "";
    return language.startsWith("es") ? "es" : "en";
  };

  onMount(() => {
    const nextLocale = detectLocale();
    preferredLocale = nextLocale;

    const timeoutId = window.setTimeout(() => {
      window.location.replace(`${base}/${nextLocale}`);
    }, 1400);

    return () => {
      clearTimeout(timeoutId);
    };
  });
</script>

<SeoHead
  locale="en"
  path="/"
  title={translateLocale("en", "seo.gateway.title")}
  description={translateLocale("en", "seo.gateway.description")}
/>

<section class="gateway" aria-labelledby="language-selector-title">
  <div class="halo halo-top" aria-hidden="true"></div>
  <div class="halo halo-bottom" aria-hidden="true"></div>

  <article class="panel">
    <p class="eyebrow">Anglicus</p>
    <h1 id="language-selector-title">
      {translateLocale("en", "seo.gateway.titleLine")}
    </h1>
    <p class="subtitle">{translateLocale("en", "seo.gateway.subtitle")}</p>

    <div class="actions">
      <a class="lang-btn english" href={englishHref}>
        {translateLocale("en", "seo.gateway.english")}
      </a>
      <a class="lang-btn spanish" href={spanishHref}>
        {translateLocale("es", "seo.gateway.spanish")}
      </a>
    </div>

    <p class="redirect-note">
      {translateLocale(preferredLocale, "seo.gateway.autoRedirect", {
        language:
          preferredLocale === "es"
            ? translateLocale("es", "languages.name.es")
            : translateLocale("en", "languages.name.en"),
      })}
      <a href={redirectHref}>{translateLocale("en", "common.continue")}</a>
    </p>
  </article>
</section>

<style>
  .gateway {
    position: relative;
    min-height: calc(100vh - 4rem);
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    overflow: hidden;
  }

  .halo {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    z-index: 0;
  }

  .halo-top {
    width: 420px;
    height: 420px;
    top: -170px;
    right: -120px;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.26), transparent 70%);
  }

  .halo-bottom {
    width: 460px;
    height: 460px;
    bottom: -220px;
    left: -140px;
    background: radial-gradient(circle, rgba(45, 212, 191, 0.22), transparent 72%);
  }

  .panel {
    position: relative;
    z-index: 1;
    width: min(680px, 100%);
    background: linear-gradient(145deg, rgba(15, 23, 42, 0.86), rgba(7, 15, 28, 0.72));
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 20px;
    padding: clamp(1.3rem, 3vw, 2.2rem);
    box-shadow: 0 20px 42px rgba(2, 6, 23, 0.45);
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #67e8f9;
    font-size: 0.78rem;
    font-weight: 700;
  }

  h1 {
    margin: 0.7rem 0 0.35rem;
    font-size: clamp(1.5rem, 3.6vw, 2.4rem);
    line-height: 1.1;
    color: #e2e8f0;
  }

  .subtitle {
    margin: 0;
    color: #94a3b8;
    line-height: 1.5;
  }

  .actions {
    margin-top: 1.3rem;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lang-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    padding: 0.85rem 1rem;
    text-decoration: none;
    font-weight: 700;
    transition: transform 0.2s ease, filter 0.2s ease;
  }

  .lang-btn:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }

  .lang-btn.english {
    color: #082f49;
    background: linear-gradient(130deg, #7dd3fc, #38bdf8);
  }

  .lang-btn.spanish {
    color: #042f2e;
    background: linear-gradient(130deg, #5eead4, #2dd4bf);
  }

  .redirect-note {
    margin: 1rem 0 0;
    color: #9fb4c8;
    font-size: 0.92rem;
  }

  .redirect-note a {
    margin-left: 0.45rem;
    color: #bae6fd;
    text-decoration: none;
    border-bottom: 1px solid rgba(186, 230, 253, 0.45);
  }

  @media (max-width: 640px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
