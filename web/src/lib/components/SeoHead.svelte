<script lang="ts">
  import type { Locale } from "$lib/i18n";
  import {
    DEFAULT_SOCIAL_IMAGE_PATH,
    SITE_NAME,
    SUPPORTED_LOCALES,
  } from "$lib/seo/config";
  import { buildHreflangAlternates, toAbsoluteUrl } from "$lib/seo/meta";

  type Props = {
    title: string;
    description: string;
    path: string;
    locale: Locale;
    type?: "website" | "article";
    imagePath?: string;
    imageAlt?: string;
    includeAlternates?: boolean;
  };

  let {
    title,
    description,
    path,
    locale,
    type = "website",
    imagePath = DEFAULT_SOCIAL_IMAGE_PATH,
    imageAlt = `${SITE_NAME} preview`,
    includeAlternates = true,
  }: Props = $props();

  const canonicalUrl = $derived(toAbsoluteUrl(path));
  const imageUrl = $derived(toAbsoluteUrl(imagePath));
  const alternates = $derived(
    includeAlternates ? buildHreflangAlternates(path) : [],
  );

  const ogLocale = $derived(locale === "es" ? "es_ES" : "en_US");
  const ogLocaleAlternates = $derived(
    SUPPORTED_LOCALES.filter((value) => value !== locale).map((value) =>
      value === "es" ? "es_ES" : "en_US",
    ),
  );
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />

  <link rel="canonical" href={canonicalUrl} />
  {#each alternates as alternate}
    <link rel="alternate" hreflang={alternate.hreflang} href={alternate.href} />
  {/each}

  <meta property="og:type" content={type} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={imageUrl} />
  <meta property="og:image:alt" content={imageAlt} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content={ogLocale} />
  {#each ogLocaleAlternates as alternateLocale}
    <meta property="og:locale:alternate" content={alternateLocale} />
  {/each}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageUrl} />
</svelte:head>
