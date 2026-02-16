<script lang="ts">
  import { goto } from "$app/navigation";
  import { base } from "$app/paths";
  import { onMount } from "svelte";
  import {
    getGoogleClientId,
    loadGoogleIdentityScript,
    loginUser,
    loginWithGoogleIdToken,
    setToken,
  } from "$lib/auth/index.js";
  import { t } from "$lib/i18n";

  let email = $state("");
  let password = $state("");
  let errorMessage = $state("");
  let isLoading = $state(false);
  let isGoogleLoading = $state(false);

  const googleClientId = getGoogleClientId();
  const hasGoogleAuthConfigured = googleClientId.trim().length > 0;
  let googleButtonContainer = $state<HTMLDivElement | null>(null);

  async function handleGoogleCredential(credential: string) {
    isGoogleLoading = true;
    errorMessage = "";

    try {
      const token = await loginWithGoogleIdToken(credential);
      setToken(token);
      goto(`${base}/`);
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : $t("auth.errors.googleLoginFailed");
    } finally {
      isGoogleLoading = false;
    }
  }

  function handleUnavailableGoogleSignIn() {
    errorMessage = $t("auth.errors.googleUnavailable");
  }

  onMount(async () => {
    if (!hasGoogleAuthConfigured || !googleButtonContainer) {
      return;
    }

    try {
      await loadGoogleIdentityScript();
      if (!window.google?.accounts?.id) {
        throw new Error("Google Identity not available");
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential?: string }) => {
          if (!response.credential) {
            errorMessage = $t("auth.errors.googleLoginFailed");
            return;
          }

          void handleGoogleCredential(response.credential);
        },
      });

      window.google.accounts.id.renderButton(googleButtonContainer, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 360,
      });
    } catch {
      errorMessage = $t("auth.errors.googleUnavailable");
    }
  });

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      errorMessage = $t("auth.errors.missingFields");
      return;
    }

    isLoading = true;
    errorMessage = "";

    try {
      const token = await loginUser(email.trim(), password);
      setToken(token);
      goto(`${base}/`);
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : $t("auth.errors.loginFailed");
    } finally {
      isLoading = false;
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    await handleLogin();
  }
</script>

<div class="auth-page">
  <form class="auth-card" onsubmit={handleSubmit}>
    <h1>{$t("auth.loginTitle")}</h1>

    <div class="google-login">
      {#if hasGoogleAuthConfigured}
        <div bind:this={googleButtonContainer}></div>
      {:else}
        <button class="google-fallback" type="button" onclick={handleUnavailableGoogleSignIn}>
          <img class="google-icon" src="{base}/google-logo.svg" alt="" />
          <span>{$t("auth.googleButton")}</span>
        </button>
        <p class="helper">{$t("auth.googleConfigHint")}</p>
      {/if}

      {#if isGoogleLoading}
        <p class="helper">{$t("common.loading")}</p>
      {/if}
    </div>

    <p class="divider"><span>{$t("auth.or")}</span></p>

    <label class="field">
      <span>{$t("auth.emailLabel")}</span>
      <input type="email" bind:value={email} autocomplete="email" required />
    </label>

    <label class="field">
      <span>{$t("auth.passwordLabel")}</span>
      <input
        type="password"
        bind:value={password}
        autocomplete="current-password"
        required
      />
    </label>

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}

    <button class="btn primary" type="submit" disabled={isLoading || isGoogleLoading}>
      {isLoading ? $t("common.loading") : $t("auth.loginButton")}
    </button>

    <div class="links">
      <a href="{base}/register">{$t("auth.registerLink")}</a>
      <a href="{base}/verify">{$t("auth.verifyLink")}</a>
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

  .google-login {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .google-fallback {
    width: 100%;
    max-width: 360px;
    min-height: 42px;
    border-radius: 999px;
    border: 1px solid #dadce0;
    background: #fff;
    color: #3c4043;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.55rem 1rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  }

  .google-fallback:hover {
    background: #f8f9fa;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .google-fallback:active {
    background: #f1f3f4;
  }

  .google-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .helper {
    margin: 0;
    text-align: center;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .divider {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: rgba(226, 232, 240, 0.7);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .divider::before,
  .divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(148, 163, 184, 0.35);
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
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
    text-align: center;
  }

  .links a {
    color: #93c5fd;
    text-decoration: none;
  }
</style>
