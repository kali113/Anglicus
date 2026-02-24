<script lang="ts">
  import SeoHead from "$lib/components/SeoHead.svelte";
  import LocalizedLegalPage from "$lib/pages/LocalizedLegalPage.svelte";
  import { translateLocale } from "$lib/seo/translate";

  const locale = "en" as const;
</script>

<SeoHead
  {locale}
  path="/en/legal"
  title={translateLocale(locale, "seo.legal.title")}
  description={translateLocale(locale, "seo.legal.description")}
/>

<LocalizedLegalPage {locale} />
