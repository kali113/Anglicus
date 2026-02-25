<script lang="ts">
  import type { PageData } from "./$types";
  import SeoHead from "$lib/components/SeoHead.svelte";
  import LocalizedLegalPage from "$lib/pages/LocalizedLegalPage.svelte";
  import { translateLocale } from "$lib/seo/translate";

  let { data }: { data: PageData } = $props();
  const locale = $derived(data.locale);
</script>

<SeoHead
  {locale}
  path="/es/legal"
  title={translateLocale(locale, "seo.legal.title")}
  description={translateLocale(locale, "seo.legal.description")}
  includeStructuredData
/>

<LocalizedLegalPage {locale} />
