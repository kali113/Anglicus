<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { page } from "$app/stores";
  import {
    hasCompletedOnboarding,
    getUserProfile,
  } from "$lib/storage/user-store";
  import { getSettings } from "$lib/storage/settings-store";
  import { startBrowserReminder } from "$lib/notifications/index.js";
  import type { UserProfile } from "$lib/types/user";
  import Navbar from "$lib/components/Navbar.svelte";
  import SupportCryptoCard from "$lib/components/SupportCryptoCard.svelte";
  import { refreshPaymentStatus } from "$lib/billing/index.js";
  import { t } from "$lib/i18n";

  let { children } = $props();
  let showNav = $state(true);
  let showFooter = $state(true);
  let onboardingComplete = $state(false);
  let user = $state<UserProfile | null>(null);

  onMount(() => {
    (async () => {
      onboardingComplete = await hasCompletedOnboarding();
      user = await getUserProfile();
    })();

    refreshPaymentStatus().catch((error) => {
      console.error("Payment check failed:", error);
    });
    const paymentInterval = window.setInterval(() => {
      refreshPaymentStatus().catch((error) => {
        console.error("Payment check failed:", error);
      });
    }, 1000 * 60 * 5);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${base}/service-worker.js`)
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    }

    const settings = getSettings();
    if (settings.notificationsEnabled && settings.dailyReminderTime) {
      startBrowserReminder(settings.dailyReminderTime);
    }

    return () => {
      clearInterval(paymentInterval);
    };
  });

  let isImmersive = $state(false);

  // Update state on navigation
  $effect(() => {
    // We access $page.url to trigger the effect on navigation
    const path = $page.url.pathname;

    // Refresh user state from storage (async)
    (async () => {
      onboardingComplete = await hasCompletedOnboarding();
      user = await getUserProfile();

      // Check if current page should be immersive (no nav, no padding)
      isImmersive = path.includes("/lesson/") && !path.endsWith("/lessons");

      // Update nav visibility
      showNav =
        onboardingComplete && !path.startsWith("/onboarding") && !isImmersive;
      showFooter = !isImmersive;
    })();
  });
</script>

<svelte:head>
  <link rel="manifest" href="{base}/manifest.json" />
  <meta name="theme-color" content="#1e293b" />
  <meta name="application-name" content={$t("app.name")} />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content={$t("app.name")} />
  <link rel="apple-touch-icon" href="{base}/icons/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="app">
  {#if showNav}
    <Navbar {user} />
  {/if}

  <main class="main {isImmersive ? 'immersive' : ''}">
    {@render children()}
  </main>

  {#if showFooter}
    <footer class="footer">
      <div class="footer-links">
        <a href="{base}/legal#terms">{$t("footer.terms")}</a>
        <a href="{base}/legal#privacy">{$t("footer.privacy")}</a>
        <a href="{base}/legal#cookies">{$t("footer.cookies")}</a>
        <a href="{base}/legal#data-protection">{$t("footer.dataProtection")}</a>
      </div>
      <div class="footer-crypto">
        <SupportCryptoCard variant="compact" />
      </div>
      <p class="footer-note">{$t("footer.tagline")}</p>
    </footer>
  {/if}
</div>

<style>
  :global(:root) {
    --bg: #1f2937;
    --bg-dark: #111827;
    --bg-card: #1f2937;
    --bg-card-light: #374151;
    --bg-secondary: #e5e7eb;
    --glass-bg: rgba(31, 41, 55, 0.7);
    --glass-border: rgba(255, 255, 255, 0.1);

    --primary: #2dd4bf;
    --primary-hover: #14b8a6;
    --primary-dark: #0d9488;
    --primary-light: #5eead4;
    --accent-blue: #3b82f6;
    --warning: #f59e0b;

    --text: #f3f4f6;
    --text-muted: #9ca3af;
    --border: #374151;
    --nav-height: 80px;
  }

  :global(body) {
    margin: 0;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      sans-serif;
    background-color: var(--bg-dark);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at top right, #1e293b 0%, #111827 40%);
  }

  .main {
    flex: 1;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    box-sizing: border-box;
  }

  .main.immersive {
    max-width: none;
    padding: 0;
  }

  .footer {
    padding: 1.5rem;
    border-top: 1px solid var(--glass-border);
    text-align: center;
    color: var(--text-muted);
  }

  .footer-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .footer-crypto {
    margin: 1rem auto;
    max-width: 520px;
  }

  .footer-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.875rem;
  }

  .footer-links a:hover {
    color: var(--text);
  }

  .footer-note {
    margin: 0;
    font-size: 0.8rem;
  }
</style>
