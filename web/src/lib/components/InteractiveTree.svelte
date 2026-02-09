<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { SKILL_TREE_DATA, type SkillNode } from "$lib/data/skills";
  import type { SkillProgress } from "$lib/types/user";

  let { userSkills = [] } = $props<{ userSkills?: SkillProgress[] }>();

  const maxY = Math.max(...SKILL_TREE_DATA.map((node) => node.y));

  // Viewport state
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let isDragging = $state(false);
  let startX = 0;
  let startY = 0;

  // Processed nodes with status
  let nodes = $derived(
    SKILL_TREE_DATA.map((node) => {
      const progress = userSkills.find((s: SkillProgress) => s.id === node.id);

      let status = "locked";
      if (progress) {
        status = progress.status;
      } else {
        const parents = SKILL_TREE_DATA.filter((n) =>
          node.requires.includes(n.id),
        );
        const parentsCompleted = parents.every(
          (p) =>
            userSkills.find((s: SkillProgress) => s.id === p.id)?.status ===
            "completed",
        );

      if (node.requires.length === 0 || parentsCompleted) {
        status = "current";
      }
    }

    const flippedX = -node.x;
    const flippedY = maxY - node.y;

    return {
      ...node,
      x: flippedX,
      y: flippedY,
      status,
      stars: progress?.stars || 0,
    };
    }),
  );

  // Calculate connections
  let connections = $derived(
    nodes.flatMap(
      (node) =>
        node.requires
          .map((parentId) => {
            const parent = nodes.find((n) => n.id === parentId);
            if (!parent) return null;
            return {
              from: parent,
              to: node,
              active: parent.status === "completed",
            };
          })
          .filter(Boolean) as {
          from: SkillNode;
          to: SkillNode;
          active: boolean;
        }[],
    ),
  );

  // Interaction handlers
  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY * -0.001;
      const newScale = Math.min(Math.max(0.4, scale + delta), 2.5);
      scale = newScale;
    }
  }

  function handleMouseDown(e: MouseEvent) {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleNodeClick(node: any) {
    if (node.status === "locked") return;
    window.location.href = `${base}/lessons/${node.id}`;
  }

  // Get category color
  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      grammar: "#8b5cf6", // Purple
      vocabulary: "#06b6d4", // Cyan
      situational: "#10b981", // Emerald
      business: "#f59e0b", // Amber
    };
    return colors[category] || "#6366f1";
  }

  function getCategoryGlow(category: string): string {
    const colors: Record<string, string> = {
      grammar: "rgba(139, 92, 246, 0.5)",
      vocabulary: "rgba(6, 182, 212, 0.5)",
      situational: "rgba(16, 185, 129, 0.5)",
      business: "rgba(245, 158, 11, 0.5)",
    };
    return colors[category] || "rgba(99, 102, 241, 0.5)";
  }

  onMount(() => {
    scale = 0.75;
    translateX = 0;
    translateY = 80 - maxY * scale;
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="tree-container"
  onwheel={handleWheel}
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
  role="application"
  aria-label="Interactive Skill Tree Map"
>
  <!-- Decorative Background Elements -->
  <div class="bg-grid"></div>
  <div class="bg-glow glow-1"></div>
  <div class="bg-glow glow-2"></div>
  <div class="bg-glow glow-3"></div>

  <div
    class="tree-content"
    style="transform: translate({translateX}px, {translateY}px) scale({scale});"
  >
    <!-- Connections Layer -->
    <svg
      class="connections-layer"
      width="800"
      height="2000"
      style="overflow: visible;"
    >
      <defs>
        <!-- Gradient for active paths -->
        <linearGradient id="activeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#2dd4bf;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
        </linearGradient>
        <!-- Glow filter -->
        <filter id="pathGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {#each connections as conn}
        <!-- Background glow path for active connections -->
        {#if conn.active}
          <path
            d={`M ${conn.from.x} ${conn.from.y} C ${conn.from.x} ${conn.from.y + 60}, ${conn.to.x} ${conn.to.y - 60}, ${conn.to.x} ${conn.to.y}`}
            fill="none"
            stroke="rgba(45, 212, 191, 0.3)"
            stroke-width="12"
            filter="url(#pathGlow)"
          />
        {/if}
        <!-- Main path -->
        <path
          d={`M ${conn.from.x} ${conn.from.y} C ${conn.from.x} ${conn.from.y + 60}, ${conn.to.x} ${conn.to.y - 60}, ${conn.to.x} ${conn.to.y}`}
          class="connection-path"
          class:active={conn.active}
          fill="none"
          stroke={conn.active ? "url(#activeGradient)" : "#1e293b"}
          stroke-width={conn.active ? "4" : "3"}
          stroke-linecap="round"
        />
      {/each}
    </svg>

    <!-- Nodes Layer -->
    <div class="nodes-layer">
      {#each nodes as node}
        <button
          class="skill-node {node.status}"
          style="
            --node-x: {node.x}px;
            --node-y: {node.y}px;
            --category-color: {getCategoryColor(node.category)};
            --category-glow: {getCategoryGlow(node.category)};
          "
          onclick={() => handleNodeClick(node)}
          disabled={node.status === "locked"}
          title={node.description}
        >
          <!-- Outer ring for current/completed -->
          {#if node.status === "current" || node.status === "completed"}
            <div class="node-ring"></div>
          {/if}

          <!-- Main node circle -->
          <div class="node-circle">
            <span class="node-icon">{node.icon}</span>

            <!-- Completion checkmark -->
            {#if node.status === "completed"}
              <div class="completion-badge">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            {/if}
          </div>

          <!-- Category indicator dot -->
          <div class="category-dot"></div>

          <!-- Star rating -->
          <div class="star-rating">
            {#each Array(3) as _, i}
              <span class="star" class:filled={i < node.stars}>★</span>
            {/each}
          </div>

          <!-- Node label -->
          <span class="node-label">{node.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Controls -->
  <div class="controls">
    <button
      class="control-btn"
      onclick={() => (scale = Math.min(2.5, scale + 0.2))}
      aria-label="Zoom in"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <button
      class="control-btn"
      onclick={() => (scale = Math.max(0.4, scale - 0.2))}
      aria-label="Zoom out"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <button
      class="control-btn"
      onclick={() => {
        scale = 0.85;
        translateX = 0;
        translateY = 50 - maxY * scale;
      }}
      aria-label="Reset view"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
      </svg>
    </button>
  </div>

  <!-- Legend -->
  <div class="legend">
    <div class="legend-item">
      <span class="legend-dot" style="background: #8b5cf6;"></span>
      <span>Grammar</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #06b6d4;"></span>
      <span>Vocabulary</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #10b981;"></span>
      <span>Situational</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: #f59e0b;"></span>
      <span>Business</span>
    </div>
  </div>
</div>

<style>
  .tree-container {
    width: 100%;
    height: 650px;
    overflow: hidden;
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
    border-radius: 24px;
    position: relative;
    cursor: grab;
    border: 1px solid rgba(139, 92, 246, 0.2);
    box-shadow:
      0 0 60px rgba(139, 92, 246, 0.1),
      0 25px 50px -12px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .tree-container:active {
    cursor: grabbing;
  }

  /* Background decorations */
  .bg-grid {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(
        rgba(139, 92, 246, 0.03) 1px,
        transparent 1px
      ),
      linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
  }

  .bg-glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
    opacity: 0.4;
  }

  .glow-1 {
    width: 300px;
    height: 300px;
    background: radial-gradient(
      circle,
      rgba(139, 92, 246, 0.4) 0%,
      transparent 70%
    );
    top: -100px;
    right: -50px;
    animation: float 8s ease-in-out infinite;
  }

  .glow-2 {
    width: 250px;
    height: 250px;
    background: radial-gradient(
      circle,
      rgba(6, 182, 212, 0.3) 0%,
      transparent 70%
    );
    bottom: -50px;
    left: -50px;
    animation: float 10s ease-in-out infinite reverse;
  }

  .glow-3 {
    width: 200px;
    height: 200px;
    background: radial-gradient(
      circle,
      rgba(16, 185, 129, 0.3) 0%,
      transparent 70%
    );
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    animation: pulse 6s ease-in-out infinite;
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0) translateX(0);
    }
    50% {
      transform: translateY(-20px) translateX(10px);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.2;
      transform: translate(-50%, -50%) scale(1);
    }
    50% {
      opacity: 0.4;
      transform: translate(-50%, -50%) scale(1.1);
    }
  }

  .tree-content {
    transform-origin: 0 0;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    position: absolute;
    top: 0;
    left: 50%;
  }

  .connections-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  .connection-path {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .connection-path.active {
    filter: drop-shadow(0 0 8px rgba(45, 212, 191, 0.5));
  }

  .nodes-layer {
    position: relative;
  }

  /* Skill Node Styles */
  .skill-node {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(calc(var(--node-x) - 50%), calc(var(--node-y) - 50%));
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    padding: 0;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .skill-node:not(:disabled):hover {
    transform: translate(calc(var(--node-x) - 50%), calc(var(--node-y) - 50%))
      scale(1.1);
  }

  .skill-node:not(:disabled):hover .node-circle {
    border-color: var(--category-color);
    box-shadow:
      0 0 30px var(--category-glow),
      0 0 60px var(--category-glow),
      inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  /* Node Ring (for current/completed) */
  .node-ring {
    position: absolute;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: linear-gradient(135deg, var(--category-color), transparent)
      border-box;
    -webkit-mask:
      linear-gradient(#fff 0 0) padding-box,
      linear-gradient(#fff 0 0);
    mask:
      linear-gradient(#fff 0 0) padding-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: rotate 4s linear infinite;
    opacity: 0.6;
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Main node circle */
  .node-circle {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
    border: 3px solid #334155;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.4),
      0 4px 10px rgba(0, 0, 0, 0.3),
      inset 0 2px 4px rgba(255, 255, 255, 0.05);
  }

  .skill-node.current .node-circle {
    border-color: var(--category-color);
    background: linear-gradient(
      145deg,
      #1e293b 0%,
      rgba(139, 92, 246, 0.1) 100%
    );
    box-shadow:
      0 0 20px var(--category-glow),
      0 10px 30px rgba(0, 0, 0, 0.4),
      inset 0 2px 4px rgba(255, 255, 255, 0.1);
    animation: pulse-glow 2s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow:
        0 0 20px var(--category-glow),
        0 10px 30px rgba(0, 0, 0, 0.4);
    }
    50% {
      box-shadow:
        0 0 40px var(--category-glow),
        0 10px 30px rgba(0, 0, 0, 0.4);
    }
  }

  .skill-node.completed .node-circle {
    background: linear-gradient(
      145deg,
      var(--category-color) 0%,
      color-mix(in srgb, var(--category-color) 70%, #0f172a) 100%
    );
    border-color: color-mix(in srgb, var(--category-color) 80%, white);
    box-shadow:
      0 0 25px var(--category-glow),
      0 10px 30px rgba(0, 0, 0, 0.4);
  }

  .skill-node.locked .node-circle {
    background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
    border-color: #1e293b;
    opacity: 0.5;
  }

  .skill-node.locked {
    cursor: not-allowed;
  }

  .node-icon {
    font-size: 2rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.3s;
  }

  .skill-node.locked .node-icon {
    filter: grayscale(0.8) brightness(0.6);
  }

  .skill-node:not(:disabled):hover .node-icon {
    transform: scale(1.1);
  }

  /* Completion badge */
  .completion-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 24px;
    height: 24px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
    border: 2px solid #0f172a;
  }

  .completion-badge svg {
    width: 14px;
    height: 14px;
    color: white;
  }

  /* Category dot */
  .category-dot {
    width: 10px;
    height: 10px;
    background: var(--category-color);
    border-radius: 50%;
    margin-top: 8px;
    box-shadow: 0 0 10px var(--category-glow);
  }

  .skill-node.locked .category-dot {
    opacity: 0.3;
    box-shadow: none;
  }

  /* Star rating */
  .star-rating {
    display: flex;
    gap: 2px;
    margin-top: 6px;
  }

  .star {
    font-size: 12px;
    color: #334155;
    transition: all 0.3s;
  }

  .star.filled {
    color: #fbbf24;
    text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
  }

  /* Node label */
  .node-label {
    margin-top: 8px;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(8px);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #e2e8f0;
    white-space: nowrap;
    border: 1px solid rgba(100, 116, 139, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.3s;
  }

  .skill-node:not(:disabled):hover .node-label {
    background: rgba(30, 41, 59, 0.95);
    border-color: var(--category-color);
    color: white;
  }

  .skill-node.locked .node-label {
    opacity: 0.5;
  }

  /* Controls */
  .controls {
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
  }

  .control-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(100, 116, 139, 0.3);
    color: #e2e8f0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.2s;
  }

  .control-btn svg {
    width: 20px;
    height: 20px;
  }

  .control-btn:hover {
    background: rgba(139, 92, 246, 0.3);
    border-color: rgba(139, 92, 246, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(139, 92, 246, 0.3);
  }

  /* Legend */
  .legend {
    position: absolute;
    bottom: 20px;
    left: 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(8px);
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(100, 116, 139, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
