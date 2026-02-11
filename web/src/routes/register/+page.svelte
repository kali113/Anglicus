<script lang="ts">
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import { registerUser } from "$lib/auth/index.js";
  import { t } from "$lib/i18n";

  const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

  let email = $state("");
  let password = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);

  async function handleRegister() {
    if (!email.trim() || !password.trim()) {
      errorMessage = $t("auth.errors.missingFields");
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      errorMessage = $t("auth.errors.passwordInvalid");
      return;
    }

    isLoading = true;
    errorMessage = "";

    try {
      await registerUser(email.trim(), password);
      goto(`${base}/verify`);
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : $t("auth.errors.registerFailed");
    } finally {
      isLoading = false;
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await handleRegister();
  }
</script>

<div class="auth-page">
  <form class="auth-card" onsubmit={handleSubmit}>
    <h1>{$t("auth.registerTitle")}</h1>
    <p class="helper">{$t("auth.registerHelper")}</p>

    <label class="field">
      <span>{$t("auth.emailLabel")}</span>
      <input type="email" bind:value={email} autocomplete="email" required />
    </label>

    <label class="field">
      <span>{$t("auth.passwordLabel")}</span>
      <input type="password" bind:value={password} autocomplete="new-password" required />
    </label>

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}

    <button class="btn primary" type="submit" disabled={isLoading}>
      {isLoading ? $t("common.loading") : $t("auth.registerButton")}
    </button>

    <div class="links">
      <a href="{base}/login">{$t("auth.loginLink")}</a>
    </div>
  </form>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem;
  }

  .auth-card {
    width: 100%;
    max-width: 420px;
    background: rgba(17, 24, 39, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    backdrop-filter: blur(12px);
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
    text-align: center;
  }

  .helper {
    margin: 0;
    text-align: center;
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.95rem;
  }

  .field input {
    padding: 0.75rem 1rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 23, 42, 0.6);
    color: #fff;
    font-size: 1rem;
  }

  .error {
    margin: 0;
    color: #fca5a5;
    font-size: 0.9rem;
  }

  .links {
    display: flex;
    justify-content: center;
    font-size: 0.9rem;
  }

  .links a {
    color: #93c5fd;
    text-decoration: none;
  }
</style>
