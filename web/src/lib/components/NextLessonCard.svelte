<script lang="ts">
  import CircularProgress from "./CircularProgress.svelte";
  import Card from "./Card.svelte";

  interface Props {
    lessonTitle: string;
    progress: number; // 0-100
    onContinue?: () => void;
  }

  let { lessonTitle, progress, onContinue }: Props = $props();
</script>

<Card variant="lesson" class="next-lesson">
  <div class="lesson-info">
    <span class="label">Siguiente lección:</span>
    <h2>{lessonTitle}</h2>
    <button class="btn-continue" onclick={onContinue}> Continuar </button>
  </div>
  <div class="progress-wrapper">
    <CircularProgress percentage={progress} size={100} />
  </div>
</Card>

<style>
  :global(.next-lesson) {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .lesson-info {
    z-index: 1;
  }

  .lesson-info .label {
    color: var(--primary, #2dd4bf);
    font-weight: 600;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .lesson-info h2 {
    font-size: 2.5rem;
    margin: 0 0 2rem 0;
    line-height: 1.1;
    font-weight: 800;
  }

  .btn-continue {
    background: #fff;
    color: #0f172a;
    border: none;
    padding: 1rem 2.5rem;
    border-radius: 14px;
    font-weight: 700;
    font-size: 1.1rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(45, 212, 191, 0.3);
    transition: all 0.2s;
  }

  .btn-continue:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(45, 212, 191, 0.4);
  }

  .progress-wrapper {
    z-index: 1;
  }
</style>
