<script lang="ts">
  import { onMount } from "svelte";
  import {
    hasCompletedOnboarding,
    getUserProfile,
  } from "$lib/storage/user-store";
  import type { UserProfile } from "$lib/types/user";
  import SkillTree from "$lib/components/SkillTree.svelte";

  let user = $state<UserProfile | null>(null);

  onMount(() => {
    if (!hasCompletedOnboarding()) {
      window.location.href = "/onboarding";
      return;
    }
    user = getUserProfile();
  });
</script>

<div class="lessons-page">
  <header class="page-header">
    <h1>Your Learning Path</h1>
    <p>Complete lessons to unlock new skills and achievements</p>
  </header>

  {#if user}
    <div class="tree-container">
      <SkillTree skills={user.skills} />
    </div>
  {/if}
</div>

<style>
  .lessons-page {
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }

  .page-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  h1 {
    font-size: 2.5rem;
    background: linear-gradient(to right, #2dd4bf, #3b82f6);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0 0 0.5rem 0;
  }

  p {
    color: var(--text-muted);
    font-size: 1.1rem;
  }

  .tree-container {
    background: rgba(31, 41, 55, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 3rem;
    backdrop-filter: blur(12px);
  }
</style>
