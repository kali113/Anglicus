<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    getSettings,
    updateSettings,
    setApiTier,
    setCustomBaseUrl,
    saveApiKey,
    clearApiKey,
    clearAllSettings,
    clearUserProfile,
    clearAllMistakes,
  } from "$lib/storage/index.js";
  import { getUserProfile } from "$lib/storage/user-store.js";
  import { testConnection, type ConnectionTestResult } from "$lib/ai/index.js";
  import type { ApiTier } from "$lib/types/api.js";

  type TestableTier = "backend" | "byok" | "puter";

  let settings = $state(getSettings());
  let profile = getUserProfile();

  let showApiDetails = $state(false);
  let testingConnection = $state(false);
  let connectionStatus: Record<TestableTier, ConnectionTestResult | null> =
    $state({
      backend: null,
      byok: null,
      puter: null,
    });

  let showDeleteConfirm = $state(false);
  let customApiKey = $state("");
  let customBaseUrl = $state(getSettings().apiConfig.customBaseUrl || "");

  async function handleSaveApiKey() {
    if (!customApiKey.trim()) return;
    const success = await saveApiKey(customApiKey.trim());
    if (success) {
      customApiKey = "";
      settings = getSettings();
      alert("API key guardada de forma segura");
    } else {
      alert("Error al guardar la API key");
    }
  }

  function selectTier(tier: ApiTier) {
    setApiTier(tier);
    settings = getSettings();
  }

  async function handleTestConnection(tier: TestableTier) {
    testingConnection = true;
    connectionStatus[tier] = null;
    await new Promise((r) => setTimeout(r, 500));
    connectionStatus[tier] = await testConnection(tier);
    testingConnection = false;
  }

  function handleClearData() {
    showDeleteConfirm = true;
  }

  async function performDelete() {
    try {
      localStorage.clear();
      // Wait for DB clear to complete before navigating
      await clearAllMistakes().catch(console.error);
      await goto("/onboarding");
    } catch (e) {
      await goto("/onboarding");
    }
  }
</script>

<div class="settings-page">
  <header class="header">
    <h1>Configuración</h1>
  </header>

  <section class="section">
    <h2>Modo de API</h2>
    <p class="help">Elige cómo quieres conectarte a la IA</p>

    <div class="api-modes">
      <button
        class="mode-card"
        class:selected={settings.apiConfig.tier === "auto"}
        onclick={() => selectTier("auto")}
      >
        <div class="mode-icon">🔄</div>
        <div class="mode-info">
          <div class="mode-name">Automático</div>
          <div class="mode-desc">Prueba todas las opciones</div>
        </div>
      </button>

      <button
        class="mode-card"
        class:selected={settings.apiConfig.tier === "backend"}
        onclick={() => selectTier("backend")}
      >
        <div class="mode-icon">☁️</div>
        <div class="mode-info">
          <div class="mode-name">Servidor</div>
          <div class="mode-desc">Usa claves del dueño</div>
        </div>
      </button>

      <button
        class="mode-card"
        class:selected={settings.apiConfig.tier === "byok"}
        onclick={() => selectTier("byok")}
      >
        <div class="mode-icon">🔑</div>
        <div class="mode-info">
          <div class="mode-name">Mi Clave</div>
          <div class="mode-desc">Usa tu API key</div>
        </div>
      </button>
    </div>
  </section>

  {#if settings.apiConfig.tier === "byok"}
    <section class="section">
      <h2>Configurar API Key</h2>
      <p class="help">Tu clave se guarda encriptada en tu dispositivo</p>

      <div class="api-config">
        <input
          type="password"
          bind:value={customApiKey}
          placeholder="sk-..."
          class="input"
        />
        <button class="btn secondary" onclick={handleSaveApiKey}>
          Guardar Clave
        </button>
      </div>

      <div class="input-group">
        <div class="input-group">
          <label>
            Base URL (opcional - por defecto: api.openai.com)
            <input
              type="text"
              bind:value={customBaseUrl}
              placeholder="https://api.openai.com"
              class="input"
              onchange={() => setCustomBaseUrl(customBaseUrl)}
            />
          </label>
        </div>
      </div>
    </section>
  {/if}

  <section class="section">
    <h2>Probar Conexión</h2>
    <p class="help">Verifica que la API funcione</p>

    <div class="test-buttons">
      <div class="test-item">
        <button
          class="btn secondary"
          onclick={() => handleTestConnection("backend")}
          disabled={testingConnection}
        >
          {#if testingConnection}
            Probando...
          {:else if connectionStatus.backend?.success === true}
            ✅ Funciona
          {:else if connectionStatus.backend?.success === false}
            ❌ Falló
          {:else}
            Probar Servidor
          {/if}
        </button>
        {#if connectionStatus.backend?.success === false && connectionStatus.backend?.error}
          <div class="error-message" title={connectionStatus.backend.error}>
            {connectionStatus.backend.error}
          </div>
        {/if}
      </div>

      <div class="test-item">
        <button
          class="btn secondary"
          onclick={() => handleTestConnection("byok")}
          disabled={testingConnection}
        >
          {#if testingConnection}
            Probando...
          {:else if connectionStatus.byok?.success === true}
            ✅ Funciona
          {:else if connectionStatus.byok?.success === false}
            ❌ Falló
          {:else}
            Probar Mi Clave
          {/if}
        </button>
        {#if connectionStatus.byok?.success === false && connectionStatus.byok?.error}
          <div class="error-message" title={connectionStatus.byok.error}>
            {connectionStatus.byok.error}
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section class="section danger">
    <h2>Zona de Peligro</h2>

    <button class="btn danger" onclick={handleClearData}>
      Borrar todos los datos
    </button>
  </section>

  {#if profile}
    <section class="section">
      <h2>Perfil</h2>
      <div class="profile-info">
        <p><strong>Nombre:</strong> {profile.name}</p>
        <p><strong>Nivel:</strong> {profile.level}</p>
        <p><strong>Racha:</strong> {profile.streakDays} días</p>
      </div>
    </section>
  {/if}

  {#if showDeleteConfirm}
    <div class="modal-backdrop">
      <div class="modal">
        <h3>¿Borrar todos los datos?</h3>
        <p>Esta acción no se puede deshacer. Perderás todo tu progreso.</p>
        <div class="modal-actions">
          <button
            class="btn secondary"
            onclick={() => (showDeleteConfirm = false)}
          >
            Cancelar
          </button>
          <button class="btn danger" onclick={performDelete}>
            Sí, borrar todo
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .section h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
  }

  .help {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .api-modes {
    display: grid;
    gap: 0.75rem;
  }

  .mode-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .mode-card:hover {
    border-color: var(--primary);
  }

  .mode-card.selected {
    border-color: var(--primary);
    background: #eff6ff;
    color: #1f2937;
  }

  .mode-card.selected .mode-name,
  .mode-card.selected .mode-desc {
    color: #1f2937;
  }

  .mode-icon {
    font-size: 1.5rem;
  }

  .mode-name {
    font-weight: 600;
  }

  .mode-desc {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .api-config {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .api-config .input {
    flex: 1;
  }

  .input-group {
    margin-bottom: 1rem;
  }

  .input-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .btn {
    padding: 0.75rem 1.25rem;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn.secondary {
    background: var(--bg-secondary);
    color: #1f2937;
  }

  .btn.secondary:hover {
    background: #d1d5db;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .test-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .error-message {
    font-size: 0.75rem;
    color: #991b1b;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .danger {
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .btn.danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .btn.danger:hover {
    background: #fecaca;
  }

  .profile-info p {
    margin: 0.25rem 0;
    color: var(--text-secondary);
  }

  .profile-info strong {
    color: var(--text);
  }

  /* Modal Styles */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg);
    padding: 2rem;
    border-radius: 1rem;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border);
  }

  .modal h3 {
    margin-top: 0;
    color: #991b1b;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
  }
</style>
