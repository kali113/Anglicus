# Anglicus — AI English tutor for Spanish speakers

[English](#english) | [Español](#español)

## English

Anglicus is an **AI English tutor for Spanish speakers** focused on daily practice, adaptive lessons, and speaking feedback.

### Live demo

Use the production web app: **https://kali113.github.io/Anglicus/**

### Who it's for

- Spanish speakers who want to improve English conversation and grammar
- Learners who want fast daily practice from phone or desktop
- Students who prefer bilingual (EN/ES) learning support

### Key features

- **AI tutor chat** — Practice English with corrections and explanations
- **Adaptive exercises** — Activities tailored to your level and mistakes
- **Speaking coach** — Voice practice with scoring and follow-up drills
- **Learning memory** — Mistake tracking to focus future practice
- **Premium upgrades** — Optional Pro access for advanced usage
- **Crypto options** — Crypto-friendly support for upgrades
- **Bilingual UI** — Interface localized for English and Spanish

### Install / use

#### Web version
Open: **https://kali113.github.io/Anglicus/**
Works in browser on mobile, tablet, and desktop.

#### Install on your phone (as an app)

**iPhone/iPad:**
1. Open the link in Safari
2. Tap Share
3. Select "Add to Home Screen"

**Android:**
1. Open the link in Chrome
2. Tap the menu (three dots)
3. Select "Install app"

**Desktop:**
1. Open the link in Chrome or Edge
2. Click the install icon in the address bar

### Have ideas or found a bug?

Open an issue in this repository.

### Developer documentation

- `AGENTS.md` — quick repo map, coding rules, and workflows
- `docs/CONTRIBUTING.md` — setup, commands, and contribution process
- `docs/architecture.md` and `docs/security.md` — technical and security references

### GitHub repository SEO checklist

- Set repository description to: `AI English tutor for Spanish speakers`
- Set website URL to: `https://kali113.github.io/Anglicus/`
- Add repository topics: `ai-tutor`, `english-learning`, `spanish-speakers`, `sveltekit`, `pwa`, `education`
- Upload a social preview image in repository settings

### Investor demo runbook (live BTC flow)

1. Validate backend + frontend health:
   - `cd api && npm run test -- --run`
   - `cd web && npm run check && npm run test && npm run build`
2. Confirm billing env vars are set in Workers:
   - `BTC_RECEIVING_ADDRESS`, `BTC_MIN_SATS`, `BTC_SUBSCRIPTION_DAYS`, `JWT_SECRET`
3. Use a pre-funded wallet and broadcast a fresh transaction to the configured BTC address before the demo.
4. Verify payment from the app and wait for status progression (`pending_unconfirmed` → `pending_confirming` → `confirmed`).
5. If explorer data is delayed, retry verification; the backend now returns `verification_delayed`/`reorg_review` instead of hard-failing.
6. Keep BYOK in advanced settings only during the pitch; run the default flow in Auto/Server mode.
7. Open `/investor` to show live conversion funnel metrics (`signup`, `onboarding`, `activation`, `paywall`, `payment`, reactivation nudges).

---

## Español

Anglicus es un **tutor de inglés con IA para hispanohablantes** centrado en práctica diaria, lecciones adaptativas y feedback de speaking.

### Demo en vivo

Abre la app web: **https://kali113.github.io/Anglicus/**

### Para quién es

- Hispanohablantes que quieren mejorar conversación y gramática en inglés
- Personas que prefieren práctica corta y constante desde móvil o desktop
- Estudiantes que valoran soporte bilingüe (ES/EN)

### Funciones clave

- **Chat con tutor IA** — Practica inglés con correcciones y explicaciones
- **Ejercicios adaptativos** — Actividades ajustadas a tu nivel y errores
- **Coach de speaking** — Práctica de voz con puntuación y ejercicios siguientes
- **Memoria de aprendizaje** — Seguimiento de errores para enfocar práctica
- **Mejoras Pro opcionales** — Acceso premium para uso avanzado
- **Soporte cripto** — Opciones de pago/soporte en cripto
- **Interfaz bilingüe** — UI en español e inglés

### Instalar / usar

#### Versión web
Entra aquí: **https://kali113.github.io/Anglicus/**
Funciona en tu navegador en celular, tablet o computadora.

#### Instalar en tu celular (como app)

**iPhone/iPad:**
1. Abre el enlace en Safari
2. Toca el botón Compartir
3. Selecciona "Añadir a pantalla de inicio"

**Android:**
1. Abre el enlace en Chrome
2. Toca el menú (tres puntitos)
3. Selecciona "Instalar app"

**Computadora:**
1. Abre el enlace en Chrome o Edge
2. Aparecerá un icono de instalación en la barra de direcciones
3. Haz clic para instalar

## ☕ Apóyanos con crypto / Support us with crypto

Si te gusta Anglicus, puedes apoyar el proyecto con una donación en criptomonedas:

| Red / Network | Dirección / Address |
|---|---|
| **ETH** | `0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7` |
| **BTC** | `bc1qnk5zfsu7pzm3suf88qnpxu36pkx0vscnq04qeg` |
| **BNB** | `0x2e30F75873B1A3A07A55179E6e7CBb7Fa8a3B0a7` |
| **Solana** | `H9WXRbYgizvGA3B2gywupwdwreocGoexu7YeLMdYPAZ8` |

### ¿Tienes ideas o encontraste un error?

¡Cuéntanos! Puedes abrir un "issue" en este repositorio.

### Documentación para desarrollo

- `AGENTS.md` — guía rápida del repositorio, reglas y flujos
- `docs/CONTRIBUTING.md` — setup, comandos y proceso de contribución
- `docs/architecture.md` y `docs/security.md` — referencias técnicas y de seguridad

### Checklist SEO del repositorio en GitHub

- Descripción del repositorio: `Tutor de inglés con IA para hispanohablantes`
- Website URL: `https://kali113.github.io/Anglicus/`
- Topics sugeridos: `ai-tutor`, `english-learning`, `spanish-speakers`, `sveltekit`, `pwa`, `education`
- Subir imagen de social preview en la configuración del repositorio

### Runbook para demo con inversores (flujo BTC real)

1. Validar salud backend + frontend:
   - `cd api && npm run test -- --run`
   - `cd web && npm run check && npm run test && npm run build`
2. Confirmar variables de billing en Workers:
   - `BTC_RECEIVING_ADDRESS`, `BTC_MIN_SATS`, `BTC_SUBSCRIPTION_DAYS`, `JWT_SECRET`
3. Usar una wallet pre-fondeada y enviar una transacción nueva al address BTC configurado antes de la demo.
4. Verificar el pago desde la app y esperar la progresión de estado (`pending_unconfirmed` → `pending_confirming` → `confirmed`).
5. Si el explorador se retrasa, reintentar verificación; el backend ahora responde `verification_delayed`/`reorg_review` en lugar de fallar duro.
6. Mantener BYOK en ajustes avanzados durante el pitch; ejecutar el flujo principal en modo Auto/Servidor.
7. Abrir `/investor` para mostrar métricas reales de embudo (`signup`, `onboarding`, `activation`, `paywall`, `payment`, nudges de reactivación).

---

*Anglicus - Hecho con amor para hispanohablantes que quieren aprender inglés*
