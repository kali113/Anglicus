# 🎓 Anglicus

ES: Tu tutor personal de inglés con IA, pensado para hispanohablantes.
EN: Your personal AI English tutor, built for Spanish speakers.

---

## Qué es / What it is
ES: Anglicus es una PWA gratuita para practicar inglés con un tutor IA, ejercicios adaptativos y seguimiento de errores.
EN: Anglicus is a free PWA to practice English with an AI tutor, adaptive exercises, and mistake tracking.

## Características / Features
- 💬 Conversa con un tutor IA / Chat with an AI tutor
- 📝 Ejercicios personalizados / Personalized exercises
- 🎯 Aprende de tus errores / Learn from your mistakes
- 📱 PWA instalable + APK vía TWA / Installable PWA + APK via TWA

## Uso / Usage
### Web (GitHub Pages)
👉 https://kali113.github.io/Anglicus/

**Enlace corto / Short link**
1. `cd web`
2. `npm run shorten -- https://kali113.github.io/Anglicus/`
3. Usa el link que imprime el comando / Use the printed link.

### Instalar PWA / Install PWA
- iPhone/iPad (Safari): Compartir → "Añadir a pantalla de inicio"
- Android (Chrome): menú ⋮ → "Instalar app"
- PC/Mac (Chrome/Edge): icono de instalación en la barra de direcciones

### APK (Android)
ES: La vía recomendada es TWA con Bubblewrap (requiere PWA desplegada, Java y Android SDK).
EN: Recommended path is TWA via Bubblewrap (requires deployed PWA, Java, and Android SDK).

```
npx @bubblewrap/cli init --manifest https://kali113.github.io/Anglicus/manifest.json
cd android && gradlew.bat assembleRelease
```

Mac/Linux:
```
cd android && ./gradlew assembleRelease
```

Nota/Note: este repositorio no incluye `android/` por defecto; el proyecto se genera al inicializar Bubblewrap.

## Desarrollo / Development
### Web
```
cd web
npm install
npm run dev
npm run build
npm run check
```

### API
```
cd api
npm install
npm run dev
npm test
npm run deploy
```

## Documentación / Documentation
- docs/CONTRIBUTING.md
- docs/architecture.md
- docs/security.md
- docs/onboarding.md
- docs/exercises.md
- docs/spanish-errors.md
- docs/development-prompt.md

## Ideas o errores / Ideas or bugs
ES: ¡Nos encanta escucharte! Abre un issue.
EN: We would love to hear from you! Please open an issue.

<p align="center">
  <b>Anglicus</b> - Hecho con ❤️ para hispanohablantes
</p>
