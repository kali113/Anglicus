<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import {
    getUserProfile,
    hasCompletedOnboarding,
  } from "$lib/storage/user-store";
  import { t } from "$lib/i18n";

  const REDIRECT_SECONDS = 5;

  let destination = $state<"onboarding" | "app">("onboarding");
  let countdown = $state(REDIRECT_SECONDS);

  let redirectHref = $derived(
    destination === "app" ? `${base}/app` : `${base}/onboarding`,
  );
  let redirectLabel = $derived(
    destination === "app"
      ? $t("intro.destinations.app")
      : $t("intro.destinations.onboarding"),
  );
  let ctaLabel = $derived(
    destination === "app" ? $t("intro.ctaApp") : $t("intro.ctaStart"),
  );

  onMount(() => {
    let redirectTimer: number | null = null;
    let countdownTimer: number | null = null;
    let cancelled = false;

    const run = async () => {
      const completed = await hasCompletedOnboarding();
      const profile = completed ? await getUserProfile() : null;

      if (cancelled) return;
      destination = completed && profile ? "app" : "onboarding";
      countdown = REDIRECT_SECONDS;

      redirectTimer = window.setTimeout(() => {
        window.location.replace(redirectHref);
      }, REDIRECT_SECONDS * 1000);

      countdownTimer = window.setInterval(() => {
        countdown = Math.max(0, countdown - 1);
      }, 1000);
    };

    void run();

    return () => {
      cancelled = true;
      if (redirectTimer !== null) {
        clearTimeout(redirectTimer);
      }
      if (countdownTimer !== null) {
        clearInterval(countdownTimer);
      }
    };
  });

  function continueNow() {
    window.location.replace(redirectHref);
  }
</script>

<section class="intro">
  <div class="intro-card">
    <p class="badge">{$t("intro.badge")}</p>
    <h1>{$t("intro.title")}</h1>
    <p class="subtitle">{$t("intro.subtitle")}</p>

    <ul class="feature-list">
      <li>{$t("intro.features.tutor")}</li>
      <li>{$t("intro.features.exercises")}</li>
      <li>{$t("intro.features.mistakes")}</li>
      <li>{$t("intro.features.speaking")}</li>
    </ul>

    <div class="actions">
      <button class="btn primary" type="button" onclick={continueNow}>
        {ctaLabel}
      </button>
    </div>

    <p class="redirecting">
      {$t("intro.redirecting", {
        destination: redirectLabel,
        seconds: countdown,
      })}
    </p>
  </div>
</section>

<style>
  .intro {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem;
  }

  .intro-card {
    width: min(740px, 100%);
    padding: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(2, 6, 23, 0.45);
  }

  .badge {
    display: inline-flex;
    margin: 0;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #99f6e4;
    border: 1px solid rgba(45, 212, 191, 0.4);
    background: rgba(45, 212, 191, 0.1);
  }

  h1 {
    margin: 1rem 0 0.9rem;
    font-size: clamp(1.8rem, 3.2vw, 2.6rem);
    line-height: 1.15;
  }

  .subtitle {
    margin: 0;
    color: rgba(226, 232, 240, 0.9);
    font-size: 1rem;
  }

  .feature-list {
    margin: 1.3rem 0 0;
    padding-left: 1.15rem;
    display: grid;
    gap: 0.6rem;
    color: rgba(226, 232, 240, 0.95);
  }

  .actions {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-start;
  }

  .btn {
    padding: 0.82rem 1.3rem;
    border-radius: 12px;
    border: 0;
    font-weight: 700;
    cursor: pointer;
  }

  .btn.primary {
    background: var(--primary);
    color: #06211d;
  }

  .btn.primary:hover {
    background: var(--primary-hover);
  }

  .redirecting {
    margin: 1rem 0 0;
    color: rgba(148, 163, 184, 0.95);
    font-size: 0.9rem;
  }

  @media (max-width: 640px) {
    .intro-card {
      padding: 1.35rem;
    }

    .feature-list {
      gap: 0.55rem;
    }

    .actions {
      justify-content: stretch;
    }

    .btn {
      width: 100%;
    }
  }
</style>
