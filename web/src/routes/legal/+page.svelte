<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import type { Locale } from "$lib/i18n";

  const STORAGE_KEY = "anglicus_locale";
  let targetLocale = $state<Locale>("es");

  const englishHref = `${base}/en/legal`;
  const spanishHref = `${base}/es/legal`;
  const targetHref = $derived(
    targetLocale === "es" ? spanishHref : englishHref,
  );

  const detectLocale = (): Locale => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "es") return stored;
    } catch {
      // Keep fallback locale if storage is not accessible.
    }

    const language = navigator.language?.toLowerCase() ?? "";
    return language.startsWith("es") ? "es" : "en";
  };

  onMount(() => {
    const nextLocale = detectLocale();
    targetLocale = nextLocale;

    const suffix = window.location.hash || "";
    window.location.replace(`${base}/${nextLocale}/legal${suffix}`);
  });
</script>

<section class="legacy-legal" aria-label="Legal redirection">
  <h1>Legal</h1>
  <p>Redirecting to the localized legal policy.</p>
  <p>
    <a href={targetHref}>Continue</a>
    <span aria-hidden="true"> · </span>
    <a href={englishHref}>English</a>
    <span aria-hidden="true"> · </span>
    <a href={spanishHref}>Español</a>
  </p>
</section>

<style>
  .legacy-legal {
    max-width: 760px;
    margin: 2rem auto;
    padding: 1.5rem;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--bg-card);
  }

  .legacy-legal h1 {
    margin: 0;
  }

  .legacy-legal p {
    color: var(--text-muted);
  }

  .legacy-legal a {
    color: var(--primary-light);
    text-decoration: none;
  }
</style>
