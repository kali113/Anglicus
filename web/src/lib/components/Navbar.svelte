<script lang="ts">
  import { page } from "$app/stores";
  import { base } from "$app/paths";
  import type { UserProfile } from "$lib/types/user";

  export let user: UserProfile | null = null;
</script>

<nav class="navbar">
  <div class="nav-content">
    <a href="{base}/" class="logo">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#2dd4bf"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline
          points="2 17 12 22 22 17"
        /><polyline points="2 12 12 17 22 12" /></svg
      >
      <span>Anglicus</span>
    </a>

    <div class="nav-links">
      <a href="{base}/" class:active={$page.url.pathname === `${base}/`}>Inicio</a>
      <a
        href="{base}/lessons"
        class:active={$page.url.pathname.startsWith(`${base}/lessons`)}>Lecciones</a
      >
      <a
        href="{base}/exercises"
        class:active={$page.url.pathname.startsWith(`${base}/exercises`)}>Práctica</a
      >
      <a
        href="{base}/profile"
        class:active={$page.url.pathname.startsWith(`${base}/profile`)}>Perfil</a
      >
    </div>

    <div class="user-menu">
      {#if user}
        <div class="user-info">
          <div class="avatar">
            <img
              src={`https://ui-avatars.com/api/?name=${user.name}&background=random`}
              alt={user.name}
            />
          </div>
          <span class="username">{user.name}</span>
        </div>
        <div class="actions">
          <button class="icon-btn" aria-label="Notificaciones">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path
                d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
              /></svg
            >
          </button>
          <a href="{base}/settings" class="icon-btn" aria-label="Configuración">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="12" cy="12" r="3" /><path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              /></svg
            >
          </a>
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>
  .navbar {
    height: var(--nav-height);
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(17, 24, 39, 0.8);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--glass-border);
  }

  .nav-content {
    max-width: 1200px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    gap: 2rem;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 700;
    font-size: 1.5rem;
    color: #fff;
    text-decoration: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .logo:hover {
    opacity: 0.8;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-left: 2rem;
    flex: 1;
  }

  .nav-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-weight: 500;
    font-size: 1rem;
    transition: color 0.2s;
    position: relative;
  }

  .nav-links a:hover,
  .nav-links a.active {
    color: var(--text);
  }

  .nav-links a.active::after {
    content: "";
    position: absolute;
    bottom: -29px;
    left: 0;
    width: 100%;
    height: 3px;
    background: var(--primary);
    border-radius: 4px 4px 0 0;
    box-shadow: 0 0 10px rgba(45, 212, 191, 0.5);
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid var(--border);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .username {
    font-weight: 600;
    font-size: 1rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .icon-btn {
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text-muted);
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-btn:hover {
    background: var(--border);
    color: var(--text);
    transform: translateY(-1px);
  }
</style>
