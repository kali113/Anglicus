<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { getUserProfile } from "$lib/storage/user-store";
  import type { UserProfile } from "$lib/types/user";
  import WeeklyChart from "$lib/components/WeeklyChart.svelte";

  let userProfile = $state<UserProfile | null>(null);

  onMount(() => {
    userProfile = getUserProfile();
  });
</script>

{#if userProfile}
  <div class="profile-page">
    <!-- Header -->
    <header class="header">
      <div class="user-info">
        <div class="avatar-container">
          <img
            src="https://ui-avatars.com/api/?name={userProfile.name}&background=0d9488&color=fff"
            alt="Avatar"
            class="avatar"
          />
        </div>
        <div class="texts">
          <h1>{userProfile.name}</h1>
          <span class="level">Nivel {userProfile.level}</span>
        </div>
      </div>
      <a href={`${base}/settings`} class="settings-btn" aria-label="Configuración">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="12" cy="12" r="3" /><path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          /></svg
        >
      </a>
    </header>

    <!-- XP Banner -->
    <section class="xp-card">
      <div class="xp-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z" /></svg
        >
      </div>
      <div class="xp-content">
        <span class="label">XP Total:</span>
        <span class="value">{userProfile.totalXP || 0}</span>
      </div>
      <div class="xp-bg"></div>
    </section>

    <!-- Stats Grid -->
    <section class="stats-grid">
      <div class="stat-box">
        <div class="stat-title">Palabras aprendidas:</div>
        <div class="stat-row">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60a5fa"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path
              d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
            /></svg
          >
          <span class="stat-number">{userProfile.wordsLearned || 0}</span>
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-title">Racha actual:</div>
        <div class="stat-row">
          <span class="fire">🔥</span>
          <span class="stat-number">{userProfile.streakDays} Días</span>
        </div>
      </div>
    </section>

    <!-- Weekly Activity -->
    <section class="chart-section">
      <h3>Actividad semanal</h3>
      <WeeklyChart data={userProfile.weeklyActivity || [0, 0, 0, 0, 0, 0, 0]} />
    </section>

    <!-- Achievements -->
    <section class="achievements-section">
      <div class="section-header">
        <h3>Logros</h3>
        <span class="unlocked-count">Desbloqueado</span>
      </div>

      <div class="achievements-scroll">
        {#each userProfile.achievements || [] as achievement}
          <div
            class="achievement-card {achievement.unlocked
              ? 'unlocked'
              : 'locked'}"
          >
            <div class="achievement-icon">
              {achievement.icon}
              {#if !achievement.unlocked}
                <div class="lock-overlay">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><rect
                      x="3"
                      y="11"
                      width="18"
                      height="11"
                      rx="2"
                      ry="2"
                    /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg
                  >
                </div>
              {/if}
            </div>
            <span class="achievement-title">{achievement.name}</span>
          </div>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-top: 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .avatar-container {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 2px solid var(--primary);
    padding: 2px;
  }

  .avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .texts h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .level {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .settings-btn {
    color: var(--text-secondary);
    padding: 0.5rem;
  }

  .xp-card {
    background: linear-gradient(
      135deg,
      var(--bg-card) 0%,
      var(--bg-card-light) 100%
    );
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
    overflow: hidden;
  }

  .xp-icon {
    width: 48px;
    height: 48px;
    background: rgba(45, 212, 191, 0.2);
    color: var(--primary-light);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .xp-content {
    display: flex;
    flex-direction: column;
  }

  .xp-content .label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .xp-content .value {
    font-size: 1.75rem;
    font-weight: 700;
    color: white;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .stat-box {
    background: var(--bg-card);
    border-radius: 16px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-title {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stat-number {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .fire {
    font-size: 1.25rem;
  }

  .chart-section {
    background: var(--bg-card);
    padding: 1.5rem;
    border-radius: 24px;
  }

  .chart-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
  }

  .achievements-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .section-header h3 {
    margin: 0;
    font-size: 1.125rem;
  }

  .unlocked-count {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .achievements-scroll {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .achievement-card {
    background: var(--bg-card);
    padding: 1rem;
    border-radius: 16px;
    min-width: 100px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    border: 1px solid transparent;
  }

  .achievement-card.unlocked {
    border-color: var(--primary);
    background: rgba(20, 184, 166, 0.05);
  }

  .achievement-icon {
    width: 48px;
    height: 48px;
    background: var(--bg);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    position: relative;
  }

  .achievement-title {
    font-size: 0.875rem;
    font-weight: 600;
    text-align: center;
  }

  .lock-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .achievement-card.locked .achievement-title {
    opacity: 0.5;
  }
</style>
