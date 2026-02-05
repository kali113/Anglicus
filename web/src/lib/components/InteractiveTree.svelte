<script lang="ts">
  import { onMount } from "svelte";
  import { SKILL_TREE_DATA, type SkillNode } from "$lib/data/skills";
  import type { SkillProgress } from "$lib/types/user";

  let { userSkills = [] } = $props<{ userSkills?: SkillProgress[] }>();

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

      // Determine status
      let status = "locked";
      if (progress) {
        status = progress.status;
      } else {
        // Check if unlocked by prerequisites
        const parents = SKILL_TREE_DATA.filter((n) =>
          node.requires.includes(n.id),
        );
        const parentsCompleted = parents.every(
          (p) =>
            userSkills.find((s: SkillProgress) => s.id === p.id)?.status ===
            "completed",
        );

        // If it has no requirements, it's unlocked (current) if not done
        // Or if all parents are done
        if (node.requires.length === 0 || parentsCompleted) {
          status = "current";
        }
      }

      return {
        ...node,
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
      const newScale = Math.min(Math.max(0.5, scale + delta), 2);
      scale = newScale;
    } else {
      // allow normal scroll if not zooming? or pan vertically?
      // Let's implement vertical scrolling as panning if not zooming
      // translateY -= e.deltaY;
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
    window.location.href = `/lessons/${node.id}`;
  }

  onMount(() => {
    // Center the tree initially (approx)
    // Assuming tree width ~400px, height ~1600px
    // Viewport center
    translateX = 300; // Offset to center horizontally
    translateY = 100;
  });
</script>

<div
  class="interactive-tree-container"
  onwheel={handleWheel}
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
  role="application"
  aria-label="Interactive Skill Tree Map"
  tabindex="0"
>
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
      {#each connections as conn}
        <path
          d={`M ${conn.from.x} ${conn.from.y} C ${conn.from.x} ${conn.from.y + 50}, ${conn.to.x} ${conn.to.y - 50}, ${conn.to.x} ${conn.to.y}`}
          class:active={conn.active}
          fill="none"
          stroke="#374151"
          stroke-width="4"
        />
      {/each}
    </svg>

    <!-- Nodes Layer -->
    <div class="nodes-layer">
      {#each nodes as node}
        <button
          class="node-btn {node.status}"
          style="transform: translate({node.x}px, {node.y}px);"
          onclick={() => handleNodeClick(node)}
          disabled={node.status === "locked"}
        >
          <div class="node-icon">
            <span class="icon">{node.icon}</span>
            <div class="level-indicator">
              {#each Array(3) as _, i}
                <span class="star" class:filled={i < node.stars}>★</span>
              {/each}
            </div>
          </div>
          <span class="node-label">{node.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Zoom Controls Overlay -->
  <div class="controls">
    <button
      class="control-btn"
      onclick={() => (scale = Math.min(2, scale + 0.2))}>+</button
    >
    <button
      class="control-btn"
      onclick={() => (scale = Math.max(0.5, scale - 0.2))}>-</button
    >
    <button
      class="control-btn"
      onclick={() => {
        translateX = 300;
        translateY = 100;
        scale = 1;
      }}>⟲</button
    >
  </div>
</div>

<style>
  .interactive-tree-container {
    width: 100%;
    height: 600px; /* Viewport height */
    overflow: hidden;
    background: var(--bg-dark); /* Match partial app background */
    border-radius: 16px;
    position: relative;
    cursor: grab;
    border: 1px solid var(--border);
  }

  .interactive-tree-container:active {
    cursor: grabbing;
  }

  .tree-content {
    transform-origin: 0 0;
    transition: transform 0.1s linear; /* Smooth pan/zoom */
    position: absolute;
    top: 0;
    left: 50%; /* Center origin horizontally */
  }

  .connections-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    /* We need to offset SVG to match HTML nodes centered at 0,0 */
    /* Wait, nodes are translated relative to parent. Parent is left:50% */
    /* We can just put SVG at 0,0 inside the transform container */
    transform: translate(0, 0);
  }

  path {
    transition: stroke 0.3s;
    stroke: #374151; /* Default grey */
  }

  path.active {
    stroke: var(--primary); /* Teal when active */
  }

  .nodes-layer {
    position: relative;
    /* Nodes use absolute positioning translation */
  }

  .node-btn {
    position: absolute;
    left: 0;
    top: 0;
    /* Center the button on its coordinate */
    width: 0;
    height: 0; /* Wrapper size 0 */
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: visible;
  }

  .node-icon {
    width: 64px;
    height: 64px;
    background: var(--bg-card);
    border: 3px solid var(--border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    position: relative;
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    transform: translate(-50%, -50%); /* Center visually on x,y */
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .node-btn:hover:not(:disabled) .node-icon {
    transform: translate(-50%, -50%) scale(1.15);
    border-color: var(--primary);
    box-shadow: 0 0 20px rgba(45, 212, 191, 0.4);
  }

  .node-btn.completed .node-icon {
    background: var(--primary);
    border-color: var(--primary-light);
    color: #fff;
  }

  .node-btn.current .node-icon {
    background: var(--bg-card);
    border-color: var(--primary);
    box-shadow: 0 0 15px var(--primary);
  }

  .node-label {
    margin-top: 10px; /* Push down relative to center */
    transform: translateY(20px);
    background: rgba(0, 0, 0, 0.6);
    padding: 4px 8px;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    backdrop-filter: blur(4px);
  }

  .level-indicator {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
  }

  .star {
    font-size: 10px;
    color: #4b5563;
  }

  .star.filled {
    color: #fbbf24; /* Gold */
  }

  .controls {
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    gap: 8px;
  }

  .control-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  }

  .control-btn:hover {
    background: var(--primary);
    color: white;
  }
</style>
