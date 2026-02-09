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

  let user = $state<UserProfile | null>(null);
  let todayActivity = $state(0);
  let currentLesson = $state({ title: "Start Learning", id: "greetings" });
  let isLoading = $state(true);

  const skillTitles: Record<string, string> = {
    greetings: "Greetings",
    food: "Food & Drink",
    directions: "Directions",
    travel: "Travel Basics",
    family: "Family",
    hobbies: "Hobbies",
    shopping: "Shopping",
    food2: "Dining Out",
    emotions: "Emotions",
    weather: "Weather",
    nature: "Nature",
  };

  onMount(() => {
    if (!hasCompletedOnboarding()) {
      window.location.href = `${base}/onboarding`;
      return;
    }
    user = getUserProfile();
    isLoading = false;

    if (user) {
      // Calculate today's activity
      const dayIndex = new Date().getDay();
      todayActivity = user.weeklyActivity[dayIndex] || 0;

      // Find current lesson
      const currentSkill =
        user.skills.find((s) => s.status === "current") ||
        user.skills.find((s) => s.status === "locked");

      if (currentSkill) {
        currentLesson = {
          title: skillTitles[currentSkill.id] || currentSkill.id,
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
</script>

{#if isLoading}
  <div class="loading-screen">
    <div class="spinner"></div>
    <p>Cargando...</p>
  </div>
{:else if user}
  <div class="dashboard">
    <!-- Main Content Area -->
    <div class="main-content">
      <header class="welcome-header">
        <h1>Bienvenido de nuevo, {user.name}!</h1>
        <div class="streak-badge">
          <span class="fire">🔥</span>
          <span>{user.streakDays} Días de racha</span>
        </div>
      </header>

      <!-- Quick Chat Section -->
      <QuickChat />

      <div class="hero-section">
        <!-- Next Lesson Card -->
        <NextLessonCard
          lessonTitle={currentLesson.title}
          progress={60}
          onContinue={navigateToLesson}
        />

        <!-- Quick Stats Row -->
        <div class="quick-stats">
          <StatCard
            title="Meta diaria"
            value={todayActivity}
            unit="/20 mins"
            progress={(todayActivity / 20) * 100}
          />
          <StatCard
            title="Palabras aprendidas"
            value={user.wordsLearned}
            unit="palabras"
            showArrow={true}
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

  .quick-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
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
