<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import {
    hasCompletedOnboarding,
    getUserProfile,
  } from "$lib/storage/user-store";
  import type { UserProfile } from "$lib/types/user";

  import Card from "$lib/components/Card.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import NextLessonCard from "$lib/components/NextLessonCard.svelte";
  import CircularProgress from "$lib/components/CircularProgress.svelte";
  import InteractiveTree from "$lib/components/InteractiveTree.svelte";
  import DashboardSidebar from "$lib/components/DashboardSidebar.svelte";
  import QuickChat from "$lib/components/QuickChat.svelte";
  import AdSlot from "$lib/components/AdSlot.svelte";
  import { trackEvent } from "$lib/analytics/index.js";
  import { getSettings } from "$lib/storage/settings-store.js";
  import { t } from "$lib/i18n";

  let user = $state<UserProfile | null>(null);
  let todayActivity = $state(0);
  let currentLesson = $state({ id: "greetings" });
  let isLoading = $state(true);
  let showComebackNudge = $state(false);
  let comebackDays = $state(0);

  const currentLessonTitle = $derived(
    $t(`skills.${currentLesson.id}.name`),
  );

  // Calculate progress based on current skill's stars (0-3 stars = 0-100%)
  const currentLessonProgress = $derived(() => {
    if (!user) return 0;
    const currentSkill = user.skills.find((s) => s.status === "current");
    if (!currentSkill) return 0;
    return Math.round((currentSkill.stars / 3) * 100);
  });
  const speakingScore = $derived(() => user?.speaking?.averageScore ?? 0);
  const speakingAttempts = $derived(() => user?.speaking?.totalAttempts ?? 0);

  onMount(async () => {
    if (!(await hasCompletedOnboarding())) {
      window.location.replace(`${base}/onboarding`);
      return;
    }
    const profile = await getUserProfile();
    if (!profile) {
      window.location.replace(`${base}/onboarding`);
      return;
    }
    user = profile;
    isLoading = false;

    if (user) {
      const daysAway = getDaysAway(user.lastActiveAt);
      if (daysAway >= 2) {
        comebackDays = daysAway;
        showComebackNudge = true;

        const todayKey = new Date().toISOString().slice(0, 10);
        const dedupeKey = `anglicus_reactivation_nudge_${todayKey}`;
        if (!sessionStorage.getItem(dedupeKey)) {
          sessionStorage.setItem(dedupeKey, "1");
          void trackEvent("reactivation_nudge_shown", {
            daysAway,
            remindersEnabled: getSettings().emailRemindersEnabled,
          });
        }
      }

      // Calculate today's activity
      const dayIndex = new Date().getDay();
      todayActivity = user.weeklyActivity[dayIndex] || 0;

      // Find current lesson
      const currentSkill =
        user.skills.find((s) => s.status === "current") ||
        user.skills.find((s) => s.status === "locked");

      if (currentSkill) {
        currentLesson = {
          id: currentSkill.id,
        };
      }
    }
  });

  function navigateToLesson() {
    // If no specific lesson logic, default to the detected current one
    // In a real app, this might route more dynamically
    window.location.href = `${base}/lesson`;
  }

  function getDaysAway(isoDate: string): number {
    const timestamp = new Date(isoDate).getTime();
    if (!Number.isFinite(timestamp)) return 0;
    return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)));
  }
</script>

{#if isLoading}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>{$t("common.loading")}</p>
    </div>
  {:else if user}
    <div class="dashboard">
    <!-- Main Content Area -->
    <div class="main-content">
      <header class="welcome-header">
        <h1>{$t("dashboard.welcomeBack", { name: user.name })}</h1>
        <div class="streak-badge">
          <span class="fire">🔥</span>
          <span>{$t("dashboard.streak", { days: user.streakDays })}</span>
        </div>
      </header>

      {#if showComebackNudge}
        <div class="reactivation-banner">
          <p class="reactivation-title">{$t("dashboard.reactivationTitle")}</p>
          <p>{$t("dashboard.reactivationBody", { days: comebackDays })}</p>
          <a class="reactivation-link" href="{base}/settings">{$t("dashboard.reactivationCta")}</a>
        </div>
      {/if}

      <AdSlot
        placement="dashboard_top"
        slotId={import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD || ""}
        billing={user?.billing}
      />

      <!-- Quick Chat Section -->
      <QuickChat />

      <div class="hero-section">
        <!-- Next Lesson Card -->
        <NextLessonCard
          lessonTitle={currentLessonTitle}
          progress={currentLessonProgress()}
          onContinue={navigateToLesson}
        />

        <!-- Quick Stats Row -->
        <div class="quick-stats">
          <StatCard
            title={$t("dashboard.dailyGoal")}
            value={todayActivity}
            unit={$t("dashboard.dailyGoalUnit", { minutes: 20 })}
            progress={(todayActivity / 20) * 100}
          />
          <StatCard
            title={$t("dashboard.wordsLearned")}
            value={user.wordsLearned}
            unit={$t("units.words")}
            showArrow={true}
          />
          <StatCard
            title={$t("dashboard.speakingScore")}
            value={speakingScore()}
            unit={$t("dashboard.speakingAttempts", { count: speakingAttempts() })}
            progress={speakingScore()}
          />
        </div>

        <!-- Skill Tree Area -->
        <Card variant="light" class="skill-tree-card">
          <InteractiveTree userSkills={user.skills} />
        </Card>
      </div>
    </div>

    <!-- Sidebar -->
    <DashboardSidebar {user} />
  </div>
{/if}

<style>
  .dashboard {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 2rem;
    padding-bottom: 2rem;
  }

  @media (max-width: 1024px) {
    .dashboard {
      grid-template-columns: 1fr;
    }
  }

  /* Welcome Header */
  .welcome-header {
    margin-bottom: 2.5rem;
  }

  .welcome-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(to right, #e2e8f0, #60a5fa);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .streak-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--warning);
    font-weight: 600;
    font-size: 1.1rem;
    background: rgba(245, 158, 11, 0.1);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .hero-section {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .reactivation-banner {
    margin-bottom: 1rem;
    border: 1px solid rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.1);
    border-radius: 14px;
    padding: 0.85rem 1rem;
  }

  .reactivation-banner p {
    margin: 0;
  }

  .reactivation-title {
    font-weight: 700;
    margin-bottom: 0.25rem !important;
  }

  .reactivation-link {
    display: inline-block;
    margin-top: 0.4rem;
    color: #fde68a;
    text-decoration: none;
    font-weight: 600;
  }

  .quick-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.5rem;
  }

  /* Skill Tree Card Overrides */
  :global(.skill-tree-card) {
    padding: 2rem;
  }

  :global(.skill-tree-card .header h3) {
    color: #0f172a !important;
  }

  :global(.skill-tree-card .unlocked-text) {
    color: #64748b !important;
  }

  :global(.skill-tree-card .label) {
    color: #334155 !important;
  }

  .loading-screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--text-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
