<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import {
    getUserProfile,
    hasCompletedOnboarding,
  } from "$lib/storage/user-store";
  import { t } from "$lib/i18n";

  let destination = $state<"onboarding" | "app">("onboarding");

  const redirectHref = $derived(
    destination === "app" ? `${base}/app` : `${base}/onboarding`,
  );
  const ctaLabel = $derived(
    destination === "app" ? $t("intro.ctaApp") : $t("intro.ctaStart"),
  );

  const highlights = $derived([
    {
      title: $t("intro.highlights.placement.title"),
      detail: $t("intro.highlights.placement.detail"),
    },
    {
      title: $t("intro.highlights.locale.title"),
      detail: $t("intro.highlights.locale.detail"),
    },
    {
      title: $t("intro.highlights.privacy.title"),
      detail: $t("intro.highlights.privacy.detail"),
    },
  ]);

  const steps = $derived([
    {
      title: $t("intro.steps.one.title"),
      body: $t("intro.steps.one.body"),
    },
    {
      title: $t("intro.steps.two.title"),
      body: $t("intro.steps.two.body"),
    },
    {
      title: $t("intro.steps.three.title"),
      body: $t("intro.steps.three.body"),
    },
  ]);

  const featureCards = $derived([
    {
      tag: $t("intro.cards.chat.tag"),
      title: $t("intro.cards.chat.title"),
      body: $t("intro.cards.chat.body"),
    },
    {
      tag: $t("intro.cards.path.tag"),
      title: $t("intro.cards.path.title"),
      body: $t("intro.cards.path.body"),
    },
    {
      tag: $t("intro.cards.speaking.tag"),
      title: $t("intro.cards.speaking.title"),
      body: $t("intro.cards.speaking.body"),
    },
  ]);

  onMount(() => {
    let cancelled = false;

    const run = async () => {
      const completed = await hasCompletedOnboarding();
      const profile = completed ? await getUserProfile() : null;

      if (cancelled) return;

      const nextDestination: "onboarding" | "app" =
        completed && profile ? "app" : "onboarding";
      destination = nextDestination;
    };

    void run();

    return () => {
      cancelled = true;
    };
  });

  function continueNow() {
    window.location.replace(redirectHref);
  }
</script>

<section class="intro-shell" aria-labelledby="intro-title">
  <div class="ambient ambient-a" aria-hidden="true"></div>
  <div class="ambient ambient-b" aria-hidden="true"></div>

  <div class="intro-grid">
    <article class="panel hero-panel">
      <p class="badge">{$t("intro.badge")}</p>
      <h1 id="intro-title">{$t("intro.title")}</h1>
      <p class="subtitle">{$t("intro.subtitle")}</p>

      <div class="action-row">
        <button class="btn primary" type="button" onclick={continueNow}>
          {ctaLabel}
        </button>
        <a class="secondary" href="#how-it-works">{$t("intro.secondaryAction")}</a>
      </div>

      <div class="highlights">
        {#each highlights as item}
          <article class="highlight-card">
            <h2>{item.title}</h2>
            <p>{item.detail}</p>
          </article>
        {/each}
      </div>
    </article>

    <aside class="panel journey-panel" id="how-it-works">
      <h2>{$t("intro.journeyTitle")}</h2>
      <ol>
        {#each steps as step, index}
          <li>
            <span class="step-index">0{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        {/each}
      </ol>
      <p class="journey-note">{$t("intro.journeyNote")}</p>
    </aside>
  </div>

  <section class="feature-grid" aria-label={$t("intro.featuresLabel")}>
    {#each featureCards as card}
      <article class="feature-card">
        <p class="feature-tag">{card.tag}</p>
        <h3>{card.title}</h3>
        <p>{card.body}</p>
      </article>
    {/each}
  </section>
</section>

<style>
  .intro-shell {
    --intro-bg: #081321;
    --intro-card: rgba(8, 24, 39, 0.72);
    --intro-border: rgba(125, 211, 252, 0.18);
    --intro-text: #e8f1f8;
    --intro-muted: #9bb4c8;
    --intro-accent: #2dd4bf;
    --intro-accent-alt: #38bdf8;

    position: relative;
    isolation: isolate;
    min-height: 100vh;
    width: min(1200px, 100%);
    margin: 0 auto;
    padding: clamp(1.2rem, 4vw, 2.5rem) clamp(0.8rem, 3vw, 1.8rem) 2.2rem;
    color: var(--intro-text);
    overflow: hidden;
  }

  .ambient {
    position: absolute;
    border-radius: 50%;
    filter: blur(0.3px);
    pointer-events: none;
    z-index: -1;
  }

  .ambient-a {
    width: 420px;
    height: 420px;
    top: -140px;
    right: -130px;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.28), rgba(8, 19, 33, 0));
  }

  .ambient-b {
    width: 380px;
    height: 380px;
    bottom: -120px;
    left: -120px;
    background: radial-gradient(circle, rgba(45, 212, 191, 0.2), rgba(8, 19, 33, 0));
  }

  .intro-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1.45fr 1fr;
    align-items: stretch;
  }

  .panel {
    border: 1px solid var(--intro-border);
    background:
      linear-gradient(140deg, rgba(15, 37, 58, 0.86), rgba(8, 24, 39, 0.76)),
      var(--intro-card);
    border-radius: 24px;
    backdrop-filter: blur(12px);
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
    animation: rise-in 0.7s ease both;
  }

  .hero-panel {
    padding: clamp(1.2rem, 3vw, 2rem);
    animation-delay: 0.05s;
  }

  .journey-panel {
    padding: clamp(1.1rem, 2.4vw, 1.6rem);
    animation-delay: 0.16s;
  }

  .badge {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.45);
    background: rgba(45, 212, 191, 0.12);
    color: #99f6e4;
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 700;
  }

  h1 {
    margin: 0.9rem 0 0.65rem;
    font-size: clamp(1.9rem, 4.2vw, 3.1rem);
    line-height: 1.05;
    max-width: 15ch;
  }

  .subtitle {
    margin: 0;
    color: var(--intro-muted);
    max-width: 56ch;
    line-height: 1.5;
  }

  .action-row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin-top: 1.2rem;
  }

  .btn {
    border: 0;
    border-radius: 12px;
    cursor: pointer;
    font-size: 0.98rem;
    font-weight: 700;
    padding: 0.8rem 1.2rem;
    transition: transform 0.2s ease, filter 0.2s ease;
  }

  .btn.primary {
    color: #05231f;
    background: linear-gradient(120deg, var(--intro-accent), #7dd3fc);
    box-shadow: 0 8px 26px rgba(45, 212, 191, 0.35);
  }

  .btn.primary:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
  }

  .secondary {
    color: #cbe6f8;
    text-decoration: none;
    border-bottom: 1px solid rgba(125, 211, 252, 0.35);
    font-weight: 600;
    padding-bottom: 1px;
  }

  .secondary:hover {
    border-bottom-color: rgba(125, 211, 252, 0.72);
    color: #eff9ff;
  }

  .highlights {
    margin-top: 1.3rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .highlight-card {
    padding: 0.78rem;
    border-radius: 14px;
    background: rgba(3, 13, 24, 0.5);
    border: 1px solid rgba(125, 211, 252, 0.15);
  }

  .highlight-card h2 {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: #d7efff;
  }

  .highlight-card p {
    margin: 0.35rem 0 0;
    color: var(--intro-muted);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .journey-panel h2 {
    margin: 0;
    font-size: 1.08rem;
  }

  .journey-panel ol {
    list-style: none;
    margin: 0.9rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.72rem;
  }

  .journey-panel li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.72rem;
    align-items: start;
  }

  .step-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(56, 189, 248, 0.18);
    color: #bae6fd;
    font-weight: 700;
    font-size: 0.8rem;
    border: 1px solid rgba(56, 189, 248, 0.28);
  }

  .journey-panel h3 {
    margin: 0.05rem 0 0;
    font-size: 0.96rem;
  }

  .journey-panel p {
    margin: 0.25rem 0 0;
    color: var(--intro-muted);
    font-size: 0.87rem;
    line-height: 1.45;
  }

  .journey-note {
    margin: 0.95rem 0 0;
    padding-top: 0.78rem;
    border-top: 1px dashed rgba(125, 211, 252, 0.22);
    color: #d2e7f6;
    font-size: 0.88rem;
  }

  .feature-grid {
    margin-top: 0.95rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.95rem;
  }

  .feature-card {
    border: 1px solid rgba(125, 211, 252, 0.16);
    border-radius: 18px;
    padding: 1rem;
    background: rgba(6, 20, 33, 0.72);
    animation: rise-in 0.75s ease both;
  }

  .feature-card:nth-child(1) {
    animation-delay: 0.18s;
  }

  .feature-card:nth-child(2) {
    animation-delay: 0.24s;
  }

  .feature-card:nth-child(3) {
    animation-delay: 0.3s;
  }

  .feature-tag {
    margin: 0;
    color: #67e8f9;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .feature-card h3 {
    margin: 0.52rem 0 0.44rem;
    font-size: 1.04rem;
    line-height: 1.25;
  }

  .feature-card p {
    margin: 0;
    font-size: 0.88rem;
    color: var(--intro-muted);
    line-height: 1.45;
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 1040px) {
    .intro-grid {
      grid-template-columns: 1fr;
    }

    .highlights {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .highlights,
    .feature-grid {
      grid-template-columns: 1fr;
    }

    .action-row {
      flex-direction: column;
      align-items: stretch;
    }

    .secondary {
      text-align: center;
      width: fit-content;
      margin: 0 auto;
    }

    .btn {
      width: 100%;
    }
  }
</style>
