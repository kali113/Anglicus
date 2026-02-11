<script lang="ts">
  import type { Achievement } from "$lib/types/user";
  import { t } from "$lib/i18n";

  let { achievement } = $props<{ achievement: Achievement }>();
  const label = $derived(() => {
    const value = $t(`achievements.${achievement.id}`);
    return value.startsWith("achievements.") ? achievement.name : value;
  });
</script>

<div class="badge" class:locked={!achievement.unlocked}>
  <div class="icon">
    {#if achievement.unlocked}
      {achievement.icon}
    {:else}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path
          d="M7 11V7a5 5 0 0 1 10 0v4"
        /></svg
      >
    {/if}
  </div>
  <span class="name">{label()}</span>
  {#if achievement.unlocked}
    <div class="check">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
      >
    </div>
  {/if}
</div>

<style>
  .badge {
    position: relative;
    background: var(--bg-dark);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 80px;
  }

  .badge.locked {
    opacity: 0.5;
    background: rgba(31, 41, 55, 0.4);
  }

  .icon {
    font-size: 2rem;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .name {
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  .check {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #2dd4bf;
    color: #111827;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
