<script lang="ts">
  let { percentage = 0, size = 120 } = $props();

  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
</script>

<div class="progress-circle" style="width: {size}px; height: {size}px;">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <circle
      class="bg"
      cx={size / 2}
      cy={size / 2}
      r={radius}
      stroke-width={strokeWidth}
    />
    <circle
      class="progress"
      cx={size / 2}
      cy={size / 2}
      r={radius}
      stroke-width={strokeWidth}
      stroke-dasharray={circumference}
      stroke-dashoffset={offset}
      stroke-linecap="round"
      transform="rotate(-90 {size / 2} {size / 2})"
    />
  </svg>
  <div class="content">
    <span class="percentage">{percentage}%</span>
  </div>
</div>

<style>
  .progress-circle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
  }

  circle {
    fill: none;
    transition: stroke-dashoffset 1s ease-out;
  }

  .bg {
    stroke: rgba(255, 255, 255, 0.1);
  }

  .progress {
    stroke: #fff;
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
  }

  .content {
    position: relative;
    z-index: 10;
    color: #fff;
    font-weight: 700;
    font-size: 1.5rem;
  }
</style>
