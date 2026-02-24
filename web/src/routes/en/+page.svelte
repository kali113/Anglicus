<script lang="ts">
  import SeoHead from "$lib/components/SeoHead.svelte";
  import LocalizedIntroPage from "$lib/pages/LocalizedIntroPage.svelte";
  import { translateLocale } from "$lib/seo/translate";

  const locale = "en" as const;
</script>

<SeoHead
  {locale}
  path="/en"
  title={translateLocale(locale, "seo.home.title")}
  description={translateLocale(locale, "seo.home.description")}
/>

<LocalizedIntroPage {locale} />
