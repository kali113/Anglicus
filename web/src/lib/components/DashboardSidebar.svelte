<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import WeeklyChart from "$lib/components/WeeklyChart.svelte";
  import AchievementBadge from "$lib/components/AchievementBadge.svelte";
  import type { UserProfile } from "$lib/types/user";

  let { user }: { user: UserProfile } = $props();
</script>

<aside class="sidebar">
  <!-- XP Card -->
  <Card variant="xp" class="xp-card">
    <div class="xp-icon">💎</div>
    <div class="xp-info">
      <span class="label">XP Total:</span>
      <span class="value">{user.totalXP?.toLocaleString() ?? "12,450"}</span>
    </div>
  </Card>

  <!-- Stats Grid -->
  <div class="stats-grid">
    <Card class="mini-card">
      <span class="label">Palabras aprendidas:</span>
      <div class="value-row">
        <span class="icon">📖</span>
        <span class="value">{user.wordsLearned ?? 540}</span>
      </div>
    </Card>
    <Card class="mini-card">
      <span class="label">Racha actual:</span>
      <div class="value-row">
        <span class="icon">🔥</span>
        <span class="value">{user.streakDays} Días</span>
      </div>
    </Card>
  </div>

  <!-- Weekly Activity -->
  <Card class="weekly-card">
    <h3>Actividad semanal</h3>
    <WeeklyChart data={user.weeklyActivity ?? [15, 25, 18, 30, 25, 22, 12]} />
  </Card>

  <!-- Achievements -->
  <Card class="achievements-card">
    <div class="card-header">
      <h3>Logros</h3>
      <span class="link">Desbloqueado</span>
    </div>
    <div class="badges-grid">
      {#each user.achievements || [] as achievement}
        <AchievementBadge {achievement} />
      {/each}
    </div>
  </Card>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  :global(.xp-card) {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1.75rem;
  }

  .xp-icon {
    font-size: 2rem;
    background: rgba(255, 255, 255, 0.15);
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .xp-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .xp-info .label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .xp-info .value {
    font-size: 1.75rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  :global(.mini-card) {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  :global(.mini-card) .label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
  }

  .value-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 700;
    font-size: 1.25rem;
  }

  :global(.weekly-card) {
    padding-bottom: 0.5rem;
  }

  :global(.weekly-card) h3,
  :global(.achievements-card) h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .badges-grid {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: space-around;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .link {
    font-size: 0.875rem;
    color: var(--primary);
    cursor: pointer;
    font-weight: 500;
  }
</style>
