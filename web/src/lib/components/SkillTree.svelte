<script lang="ts">
  import type { SkillProgress } from "$lib/types/user";

  let { skills = [] } = $props<{ skills?: SkillProgress[] }>();

  // Static layout data
  const layout = [
    { id: "greetings", name: "Greetings", x: 50, y: 80, icon: "💬" },
    { id: "food", name: "Food", x: 150, y: 40, icon: "🍴" },
    { id: "directions", name: "Directions", x: 250, y: 80, icon: "🔒" },
    { id: "travel", name: "Viajes", x: 150, y: 140, icon: "✈️" },
    { id: "family", name: "Familia", x: 50, y: 200, icon: "👨‍👩‍👧" },
    { id: "hobbies", name: "Hobbies", x: 150, y: 260, icon: "🎨" },
    { id: "shopping", name: "Compras", x: 250, y: 320, icon: "🛍️" },
    { id: "food2", name: "Restaurante", x: 150, y: 380, icon: "🍽️" },
    { id: "emotions", name: "Emociones", x: 50, y: 440, icon: "🎭" },
    { id: "weather", name: "Clima", x: 150, y: 500, icon: "☀️" },
    { id: "nature", name: "Naturaleza", x: 250, y: 560, icon: "🌳" },
  ];

  // Merge layout with current status
  let nodes = $derived(
    layout.map((node) => {
      const userSkill = skills.find((s: SkillProgress) => s.id === node.id);
      return {
        ...node,
        status: userSkill?.status || "locked",
        stars: userSkill?.stars || 0,
      };
    }),
  );

  // Connections between nodes (indices in layout array)
  const connections = [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 5, to: 6 },
    { from: 6, to: 7 },
    { from: 7, to: 8 },
    { from: 8, to: 9 },
    { from: 9, to: 10 },
  ];
</script>

<div class="skill-tree">
  <div class="header">
    <h3>Árbol de Habilidades</h3>
    <span class="unlocked-text">Desbloqueado</span>
  </div>

  <div class="tree-viz">
    <svg class="connections" width="300" height="650" viewBox="0 0 300 650">
      {#each connections as conn}
        {@const start = nodes[conn.from]}
        {@const end = nodes[conn.to]}
        <path
          d={`M ${start.x} ${start.y} C ${start.x} ${start.y - 40}, ${end.x} ${end.y + 40}, ${end.x} ${end.y}`}
          fill="none"
          stroke="#374151"
          stroke-width="4"
          class:active={nodes[conn.from].status === "completed"}
        />
      {/each}
    </svg>

    {#each nodes as skill}
      <button
        class="node {skill.status}"
        style="left: {skill.x}px; top: {skill.y}px;"
        disabled={skill.status === "locked"}
        aria-label={`Start ${skill.name} lesson`}
        onclick={() => {
          // We can dispatch an event here or just let the parent handle navigation if we wrapped in <a>
          // For now, let's just log it or maybe complete it for demo purposes?
          // User wants "functional". Let's emit an event.
          // Actually, Svelte 5 props... let's pass a callback prop or just use window.location for now simpler
          if (skill.status !== "locked") {
            window.location.href = `/lessons/${skill.id}`;
          }
        }}
      >
        <div class="icon-circle">
          {skill.icon}
          {#if skill.status === "completed"}
            <div class="check">✓</div>
          {/if}
        </div>
        <span class="label">{skill.name}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .skill-tree {
    background: var(--bg-secondary);
    border-radius: 16px;
    width: 100%;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .unlocked-text {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .tree-viz {
    position: relative;
    width: 300px;
    height: 650px;
    margin: 0 auto;
  }

  .connections {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  path {
    transition: stroke 0.5s;
  }

  path.active {
    stroke: #2dd4bf;
  }

  .node {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .node:disabled {
    cursor: not-allowed;
  }

  .icon-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    position: relative;
    transition: all 0.3s;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .node:not(:disabled):hover .icon-circle {
    transform: scale(1.1);
  }

  .node.completed .icon-circle {
    background: linear-gradient(135deg, #2dd4bf, #0d9488);
    border-color: #2dd4bf;
    color: white;
  }

  .node.current .icon-circle {
    background: linear-gradient(135deg, #2dd4bf, #0d9488);
    border-color: #f0f9ff;
    box-shadow: 0 0 15px rgba(45, 212, 191, 0.6);
    color: white;
  }

  .node.locked .icon-circle {
    background: var(--bg-card);
    border-color: var(--border);
    opacity: 0.7;
    color: var(--text-muted);
  }

  .check {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 16px;
    height: 16px;
    background: #f0f9ff;
    color: #2dd4bf;
    border-radius: 50%;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    border: 1px solid #2dd4bf;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .node.locked .label {
    color: var(--text-muted);
  }
</style>
