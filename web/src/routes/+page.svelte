<script lang="ts">
  import { onMount } from "svelte";
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

  let user = $state<UserProfile | null>(null);

  onMount(() => {
    if (!hasCompletedOnboarding()) {
      window.location.href = "/onboarding";
      return;
    }
    user = getUserProfile();
  });

  function navigateToLesson() {
    window.location.href = "/lessons/travel-basics";
  }
</script>

{#if user}
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

      <div class="hero-section">
        <!-- Next Lesson Card -->
        <NextLessonCard
          lessonTitle="Travel Basics"
          progress={60}
          onContinue={navigateToLesson}
        />

        <!-- Quick Stats Row -->
        <div class="quick-stats">
          <StatCard
            title="Meta diaria"
            value={15}
            unit="/20 mins"
            progress={75}
          />
          <StatCard
            title="Repasar errores"
            value={5}
            unit="items"
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
    background: linear-gradient(to right, #ffffff, #94a3b8);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
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
</style>
