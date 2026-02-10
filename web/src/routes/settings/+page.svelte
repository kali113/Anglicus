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
  import { getUserProfile, updateUserProfile } from "$lib/storage/user-store.js";
  import {
    requestNotificationPermission,
    startBrowserReminder,
    stopBrowserReminder,
    showBrowserReminderNow,
    subscribeReminders,
    unsubscribeReminders,
    sendReminderTest,
    type ReminderFrequency,
  } from "$lib/notifications/index.js";
  import { testConnection, type ConnectionTestResult } from "$lib/ai/index.js";
  import type { ApiTier } from "$lib/types/api.js";

  type TestableTier = "backend" | "byok" | "puter";

  let settings = $state(getSettings());
  let profile = $state(getUserProfile());

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

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DEFAULT_REMINDER_TIME = "20:00";

  let reminderTime = $state(
    getSettings().dailyReminderTime || DEFAULT_REMINDER_TIME,
  );
  let reminderFrequency = $state(
    getSettings().reminderFrequency || ("daily" as ReminderFrequency),
  );
  let reminderEmail = $state("");
  let remindersBusy = $state(false);

  $effect(() => {
    if (!reminderEmail && profile?.email) {
      reminderEmail = profile.email;
    }
  });

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

  function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  function isValidEmail(value: string): boolean {
    return EMAIL_REGEX.test(value.trim());
  }

  async function toggleBrowserReminders() {
    if (settings.notificationsEnabled) {
      updateSettings({ notificationsEnabled: false });
      settings = getSettings();
      stopBrowserReminder();
      return;
    }

    const permission = await requestNotificationPermission();
    if (permission !== "granted") {
      alert("Necesitas permitir notificaciones para activar recordatorios.");
      return;
    }

    if (!reminderTime) reminderTime = DEFAULT_REMINDER_TIME;
    updateSettings({ notificationsEnabled: true, dailyReminderTime: reminderTime });
    settings = getSettings();
    startBrowserReminder(reminderTime);
  }

  function handleReminderTimeChange() {
    if (!reminderTime) return;
    updateSettings({ dailyReminderTime: reminderTime });
    settings = getSettings();
    if (settings.notificationsEnabled) startBrowserReminder(reminderTime);
    if (settings.emailRemindersEnabled) void syncEmailReminders();
  }

  function handleReminderFrequencyChange() {
    updateSettings({ reminderFrequency });
    settings = getSettings();
    if (settings.emailRemindersEnabled) void syncEmailReminders();
  }

  async function syncEmailReminders() {
    const email = normalizeEmail(reminderEmail || profile?.email || "");
    if (!email) {
      alert("Escribe un email para activar recordatorios.");
      return;
    }

    if (!isValidEmail(email)) {
      alert("El email no es valido.");
      return;
    }

    remindersBusy = true;
    const success = await subscribeReminders({
      email,
      reminderTime: reminderTime || DEFAULT_REMINDER_TIME,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      frequency: reminderFrequency,
      language: profile?.nativeLanguage || "es",
    });
    remindersBusy = false;

    if (!success) {
      alert("No se pudo guardar el recordatorio por email.");
      return;
    }

    updateUserProfile({ email });
    profile = getUserProfile();
    reminderEmail = email;

    updateSettings({
      emailRemindersEnabled: true,
      dailyReminderTime: reminderTime || DEFAULT_REMINDER_TIME,
      reminderFrequency,
    });
    settings = getSettings();
  }

  async function disableEmailReminders(clearEmail: boolean) {
    const email = normalizeEmail(reminderEmail || profile?.email || "");
    if (email) {
      remindersBusy = true;
      const success = await unsubscribeReminders(email);
      remindersBusy = false;
      if (!success) {
        alert("No se pudo desactivar el recordatorio por email.");
        return;
      }
    }

    updateSettings({ emailRemindersEnabled: false });
    settings = getSettings();

    if (clearEmail) {
      updateUserProfile({ email: undefined });
      profile = getUserProfile();
      reminderEmail = "";
    }
  }

  async function toggleEmailReminders() {
    if (settings.emailRemindersEnabled) {
      await disableEmailReminders(false);
      return;
    }

    await syncEmailReminders();
  }

  async function handleSendReminderTest() {
    const email = normalizeEmail(reminderEmail || profile?.email || "");
    if (!email || !isValidEmail(email)) {
      alert("Necesitas un email valido para enviar la prueba.");
      return;
    }

    remindersBusy = true;
    const success = await sendReminderTest({
      email,
      language: profile?.nativeLanguage || "es",
    });
    remindersBusy = false;

    if (!success) {
      alert("No se pudo enviar el email de prueba.");
      return;
    }

    alert("Email de prueba enviado.");
  }

  async function handleDeleteReminderData() {
    await disableEmailReminders(true);
  }

  async function handleTestNotification() {
    const permission = await requestNotificationPermission();
    if (permission !== "granted") {
      alert("Debes permitir notificaciones para ver la prueba.");
      return;
    }

    await showBrowserReminderNow();
  }

  function handleClearData() {
    showDeleteConfirm = true;
  }

  async function performDelete() {
    const reminderEmail = profile?.email;
    try {
      if (reminderEmail) {
        const success = await unsubscribeReminders(reminderEmail);
        if (!success) {
          alert("No se pudieron borrar los recordatorios en el servidor.");
        }
      }
      stopBrowserReminder();
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

  <section class="section" id="notifications">
    <h2>Notificaciones</h2>
    <p class="help">Configura recordatorios de practica.</p>

    <div class="notification-card">
      <div class="toggle-row">
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onchange={toggleBrowserReminders}
          />
          <span>Recordatorios en el navegador</span>
        </label>
        <button class="btn secondary" onclick={handleTestNotification}>
          Probar
        </button>
      </div>
      <p class="help small">
        Se mostraran mientras la app este abierta y con permiso activado.
      </p>
    </div>

    <div class="reminder-grid">
      <div class="input-group">
        <label>
          Hora del recordatorio
          <input
            type="time"
            class="input"
            bind:value={reminderTime}
            onchange={handleReminderTimeChange}
          />
        </label>
      </div>
      <div class="input-group">
        <label>
          Frecuencia
          <select
            class="input"
            bind:value={reminderFrequency}
            onchange={handleReminderFrequencyChange}
          >
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
          </select>
        </label>
      </div>
    </div>

    <div class="notification-card">
      <div class="toggle-row">
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.emailRemindersEnabled}
            onchange={toggleEmailReminders}
            disabled={remindersBusy}
          />
          <span>Recordatorios por email</span>
        </label>
        <button
          class="btn secondary"
          onclick={handleSendReminderTest}
          disabled={remindersBusy || !settings.emailRemindersEnabled}
        >
          Enviar prueba
        </button>
      </div>

      <div class="input-group">
        <label>
          Email
          <input
            type="email"
            class="input"
            placeholder="tu@email.com"
            bind:value={reminderEmail}
          />
        </label>
        {#if reminderEmail.trim() && !isValidEmail(reminderEmail)}
          <p class="error-text">Email invalido.</p>
        {/if}
      </div>

      <p class="help small">
        Tu email se guarda cifrado solo para enviar recordatorios. Puedes
        eliminarlo cuando quieras.
      </p>

      <div class="reminder-actions">
        <button
          class="btn secondary"
          onclick={syncEmailReminders}
          disabled={remindersBusy ||
            (!reminderEmail.trim() && !profile?.email) ||
            (!!reminderEmail.trim() && !isValidEmail(reminderEmail))}
        >
          Guardar
        </button>
        <button
          class="btn danger"
          onclick={handleDeleteReminderData}
          disabled={remindersBusy}
        >
          Eliminar datos
        </button>
      </div>
    </div>
  </section>

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

  .help.small {
    font-size: 0.8rem;
  }

  .notification-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-card);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }

  .toggle input {
    width: 18px;
    height: 18px;
  }

  .reminder-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .reminder-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .error-text {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: #fca5a5;
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
