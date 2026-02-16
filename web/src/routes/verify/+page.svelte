<script lang="ts">
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import { setToken, verifyUser } from "$lib/auth/index.js";
  import { trackEvent } from "$lib/analytics/index.js";
  import { t } from "$lib/i18n";

  let email = $state("");
  let code = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);

  async function handleVerify() {
    if (!email.trim() || !code.trim()) {
      errorMessage = $t("auth.errors.missingFields");
      return;
    }

    isLoading = true;
    errorMessage = "";

    try {
      const token = await verifyUser(email.trim(), code.trim());
      setToken(token);
      void trackEvent("signup_completed");
      goto(`${base}/`);
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : $t("auth.errors.verifyFailed");
    } finally {
      isLoading = false;
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await handleVerify();
  }
</script>

<div class="auth-page">
  <form class="auth-card" onsubmit={handleSubmit}>
    <h1>{$t("auth.verifyTitle")}</h1>
    <p class="helper">{$t("auth.verifyHelper")}</p>

    <label class="field">
      <span>{$t("auth.emailLabel")}</span>
      <input type="email" bind:value={email} autocomplete="email" required />
    </label>

    <label class="field">
      <span>{$t("auth.codeLabel")}</span>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="6"
        bind:value={code}
        required
      />
    </label>

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}

    <button class="btn primary" type="submit" disabled={isLoading}>
      {isLoading ? $t("common.loading") : $t("auth.verifyButton")}
    </button>

    <p class="trust-copy">
      <span class="lang-en">After verification, you can start learning immediately and upgrade to Pro anytime.</span>
      <span class="lang-divider"> / </span>
      <span class="lang-es">Tras verificarte, puedes empezar a aprender de inmediato y mejorar a Pro en cualquier momento.</span>
    </p>

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

  .trust-copy {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.72);
    text-align: center;
    line-height: 1.4;
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
