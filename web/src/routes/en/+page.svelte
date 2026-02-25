<script lang="ts">
  import type { PageData } from "./$types";
  import SeoHead from "$lib/components/SeoHead.svelte";
  import LocalizedIntroPage from "$lib/pages/LocalizedIntroPage.svelte";
  import { translateLocale } from "$lib/seo/translate";

  let { data }: { data: PageData } = $props();
  const locale = $derived(data.locale);
</script>

<SeoHead
  {locale}
  path="/en"
  title={translateLocale(locale, "seo.home.title")}
  description={translateLocale(locale, "seo.home.description")}
  includeStructuredData
/>

<LocalizedIntroPage {locale} />
