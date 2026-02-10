<svelte:head>
  <title>Legal | Anglicus</title>
</svelte:head>

<div class="legal-page">
  <header class="legal-header">
    <h1>Legal</h1>
    <p>Ultima actualizacion: 2026-02-10</p>
    <p>
      Este resumen no es asesoramiento legal. Para dudas legales, consulta un
      profesional.
    </p>
  </header>

  <section id="terms" class="legal-section">
    <h2>Terminos de Servicio / Terms of Service</h2>
    <p>
      <strong>ES:</strong> Anglicus es una herramienta educativa. El servicio se
      ofrece "tal cual" y puede cambiar con el tiempo. Eres responsable del
      contenido que compartes y de cumplir la ley aplicable. Si eres menor,
      utiliza la app con permiso de tus tutores.
    </p>
    <p>
      <strong>EN:</strong> Anglicus is an educational tool. The service is
      provided "as is" and may change over time. You are responsible for the
      content you share and for complying with applicable law. If you are a
      minor, use the app with guardian permission.
    </p>
    <p>
      Contacto / Contact: support@anglicus.app
    </p>
  </section>

  <section id="privacy" class="legal-section">
    <h2>Privacidad / Privacy</h2>
    <p>
      <strong>ES:</strong> Guardamos tu progreso y configuracion en tu propio
      dispositivo (localStorage). Si activas recordatorios por email, guardamos
      tu email cifrado solo para enviarte recordatorios y nunca lo vendemos.
      Puedes desactivar o borrar estos datos desde Configuracion.
    </p>
    <p>
      <strong>EN:</strong> Your progress and settings are stored on your device
      (localStorage). If you enable email reminders, your email is stored
      encrypted only for sending reminders and is never sold. You can disable or
      delete this data from Settings.
    </p>
  </section>

  <section id="cookies" class="legal-section">
    <h2>Cookies / Cookies</h2>
    <p>
      <strong>ES:</strong> Usamos almacenamiento local y cookies tecnicas
      necesarias para el funcionamiento y la seguridad. No usamos cookies de
      publicidad.
    </p>
    <p>
      <strong>EN:</strong> We use local storage and essential technical cookies
      for functionality and security. We do not use advertising cookies.
    </p>
  </section>

  <section id="data-protection" class="legal-section">
    <h2>Proteccion de Datos / Data Protection</h2>
    <p>
      <strong>ES:</strong> Puedes solicitar acceso, correccion o eliminacion de
      tus datos. La eliminacion se puede hacer desde Configuracion (Borrar todos
      los datos) o escribiendo a support@anglicus.app.
    </p>
    <p>
      <strong>EN:</strong> You can request access, correction, or deletion of
      your data. Deletion can be done from Settings (Delete all data) or by
      emailing support@anglicus.app.
    </p>
  </section>
</div>

<style>
  .legal-page {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .legal-header h1 {
    margin: 0 0 0.5rem;
  }

  .legal-header p {
    margin: 0.25rem 0;
    color: var(--text-muted);
  }

  .legal-section {
    padding: 1.5rem;
    border-radius: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .legal-section h2 {
    margin: 0;
  }

  .legal-section p {
    margin: 0;
    color: var(--text-secondary);
  }
</style>
