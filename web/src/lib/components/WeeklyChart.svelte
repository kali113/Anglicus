<script lang="ts">
  interface Props {
    data: number[]; // Array of 7 numbers representing activity for Mon-Sun
    labels?: string[];
  }

  let {
    data,
    labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  }: Props = $props();

  // Normalize data for bar heights (max height 100%)
  const maxVal = $derived(Math.max(...data, 1)); // avoid division by zero
  const normalizedData = $derived(data.map((v) => (v / maxVal) * 100));
</script>

<div class="chart-container">
  {#each normalizedData as height, i}
    <div class="chart-col">
      <div class="bar-container">
        <div class="bar" style="height: {height}%" title="{data[i]} mins">
          <div class="bar-glow"></div>
        </div>
      </div>
      <div class="label">{labels[i]}</div>
    </div>
  {/each}
</div>

<style>
  .chart-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    height: 150px;
    width: 100%;
    gap: 0.5rem;
    padding-top: 2rem;
  }

  .chart-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    height: 100%;
  }

  .bar-container {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    position: relative;
  }

  .bar {
    width: 80%;
    max-width: 16px;
    background: linear-gradient(
      180deg,
      var(--primary-light) 0%,
      var(--primary) 100%
    );
    border-radius: 20px;
    position: relative;
    min-height: 8px;
    transition: height 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    opacity: 0.9;
  }

  .bar:hover {
    opacity: 1;
    transform: scaleX(1.1);
  }

  .bar-glow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    background: inherit;
    filter: blur(8px);
    opacity: 0.4;
    z-index: -1;
  }

  .label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
</style>
