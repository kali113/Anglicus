<script lang="ts">
  interface Props {
    title: string;
    value: number | string;
    unit?: string;
    progress?: number; // 0-100
    showArrow?: boolean;
    arrowColor?: string;
  }

  let {
    title,
    value,
    unit = "",
    progress,
    showArrow = false,
    arrowColor = "#ef4444",
  }: Props = $props();
</script>

<div class="stat-card">
  <div class="stat-header">
    <h3>{title}</h3>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg
    >
  </div>

  <div class="stat-value">
    <span class="big">{value}</span>
    {#if unit}
      <span class="small">{unit}</span>
    {/if}
  </div>

  {#if progress !== undefined}
    <div class="progress-bar">
      <div class="fill" style="width: {progress}%"></div>
    </div>
  {/if}

  {#if showArrow}
    <div class="action-arrow">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={arrowColor}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </div>
  {/if}
</div>

<style>
  .stat-card {
    background: #ffffff;
    border-radius: 24px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: transform 0.2s;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border: none;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #64748b;
  }

  .stat-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .stat-value {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    color: #0f172a;
  }

  .stat-value .big {
    font-size: 2rem;
    font-weight: 700;
  }

  .stat-value .small {
    font-size: 0.9rem;
    color: #64748b;
  }

  .progress-bar {
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar .fill {
    height: 100%;
    background: var(--primary, #2dd4bf);
    border-radius: 4px;
  }

  .action-arrow {
    align-self: flex-end;
    opacity: 0.8;
  }
</style>
