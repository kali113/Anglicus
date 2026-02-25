<script lang="ts">
  import { onMount } from "svelte";
  import { setLocale, type Locale } from "$lib/i18n";
  import { translateLocale } from "$lib/seo/translate";

  type LegalSection = {
    id: string;
    titleKey: string;
    introKey: string;
    points: string[];
    outroKey?: string;
  };

  interface $$Props {
    locale: Locale;
  }

  let { locale }: $$Props = $props();

  const tx = (key: string, vars?: Record<string, string | number>) =>
    translateLocale(locale, key, vars);

  const sections: LegalSection[] = [
    {
      id: "terms",
      titleKey: "legal.terms.title",
      introKey: "legal.terms.intro",
      points: [
        "legal.terms.point1",
        "legal.terms.point2",
        "legal.terms.point3",
        "legal.terms.point4",
        "legal.terms.point5",
        "legal.terms.point6",
      ],
      outroKey: "legal.terms.outro",
    },
    {
      id: "privacy",
      titleKey: "legal.privacy.title",
      introKey: "legal.privacy.intro",
      points: [
        "legal.privacy.point1",
        "legal.privacy.point2",
        "legal.privacy.point3",
        "legal.privacy.point4",
        "legal.privacy.point5",
        "legal.privacy.point6",
      ],
      outroKey: "legal.privacy.outro",
    },
    {
      id: "cookies",
      titleKey: "legal.cookies.title",
      introKey: "legal.cookies.intro",
      points: [
        "legal.cookies.point1",
        "legal.cookies.point2",
        "legal.cookies.point3",
        "legal.cookies.point4",
        "legal.cookies.point5",
        "legal.cookies.point6",
      ],
      outroKey: "legal.cookies.outro",
    },
    {
      id: "data-protection",
      titleKey: "legal.dataProtection.title",
      introKey: "legal.dataProtection.intro",
      points: [
        "legal.dataProtection.point1",
        "legal.dataProtection.point2",
        "legal.dataProtection.point3",
        "legal.dataProtection.point4",
        "legal.dataProtection.point5",
        "legal.dataProtection.point6",
      ],
      outroKey: "legal.dataProtection.outro",
    },
  ];

  onMount(() => {
    setLocale(locale);
  });
</script>

<div class="legal-page">
  <header class="legal-header">
    <h1>{tx("legal.title")}</h1>
    <p>{tx("legal.lastUpdated", { date: "2026-02-25" })}</p>
    <p>{tx("legal.disclaimer")}</p>
    <p class="legal-overview">{tx("legal.overview")}</p>
  </header>

  {#each sections as section}
    <section id={section.id} class="legal-section">
      <h2>{tx(section.titleKey)}</h2>
      <p>{tx(section.introKey)}</p>
      <ul class="legal-list">
        {#each section.points as point}
          <li>{tx(point)}</li>
        {/each}
      </ul>
      {#if section.outroKey}
        <p>{tx(section.outroKey)}</p>
      {/if}
    </section>
  {/each}
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

  .legal-overview {
    margin-top: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.5;
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
    line-height: 1.55;
  }

  .legal-list {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .legal-list li {
    line-height: 1.5;
  }
</style>
