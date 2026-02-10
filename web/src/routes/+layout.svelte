<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { page } from "$app/stores";
  import {
    hasCompletedOnboarding,
    getUserProfile,
  } from "$lib/storage/user-store";
  import type { UserProfile } from "$lib/types/user";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
  let showNav = $state(true);
  let onboardingComplete = $state(false);
  let user = $state<UserProfile | null>(null);

  onMount(() => {
    onboardingComplete = hasCompletedOnboarding();
    user = getUserProfile();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${base}/service-worker.js`)
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    }
  });

  let isImmersive = $state(false);

  // Update state on navigation
  $effect(() => {
    // We access $page.url to trigger the effect on navigation
    const path = $page.url.pathname;

    // Refresh user state from storage
    onboardingComplete = hasCompletedOnboarding();
    user = getUserProfile();

    // Check if current page should be immersive (no nav, no padding)
    isImmersive = path.includes("/lesson/") && !path.endsWith("/lessons");

    // Update nav visibility
    showNav =
      onboardingComplete && !path.startsWith("/onboarding") && !isImmersive;
  });
</script>

<svelte:head>
  <link rel="manifest" href="{base}/manifest.json" />
  <meta name="theme-color" content="#1e293b" />
  <meta name="application-name" content="Anglicus" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Anglicus" />
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
</style>
