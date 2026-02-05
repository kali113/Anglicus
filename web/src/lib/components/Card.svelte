<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "default" | "gradient" | "xp" | "lesson" | "light";
    class?: string;
    children: Snippet;
  }

  let {
    variant = "default",
    class: className = "",
    children,
  }: Props = $props();
</script>

<div class="card {variant} {className}">
  {@render children()}
</div>

<style>
  .card {
    background: rgba(31, 41, 55, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  }

  .card.light {
    background: #ffffff;
    border: none;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .card.gradient {
    background: linear-gradient(
      135deg,
      rgba(45, 212, 191, 0.15),
      rgba(59, 130, 246, 0.15)
    );
    border: 1px solid rgba(45, 212, 191, 0.3);
  }

  .card.xp {
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.2),
      rgba(37, 99, 235, 0.2)
    );
    border: 1px solid rgba(59, 130, 246, 0.4);
  }

  .card.lesson {
    background: linear-gradient(
      135deg,
      rgba(45, 212, 191, 0.15),
      rgba(59, 130, 246, 0.15)
    );
    border: 1px solid rgba(45, 212, 191, 0.3);
    position: relative;
    overflow: hidden;
    padding: 2.5rem;
  }

  .card.lesson::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      circle at top right,
      rgba(45, 212, 191, 0.2),
      transparent 60%
    );
    pointer-events: none;
  }
</style>
