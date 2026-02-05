# Development Prompt - Anglicus

Use this prompt to start building the app.

---

```
Build Anglicus - an English learning platform for Spanish speakers.

## Apps
1. **Web App (PWA)** - Progressive Web App, installable, works offline
2. **Android APK** - Native download for users who prefer it

### PWA Requirements
```

/manifest.json - App name, icons, theme color
/service-worker.js - Offline caching
HTTPS - Required (free via Cloudflare/Netlify)

```

### PWA Features to Implement
- Add to Home Screen prompt
- Offline mode (cached exercises)
- Push notifications (lesson reminders)
- Fullscreen app experience (no browser UI)

### Android APK
- Can use same codebase via:
  - **TWA (Trusted Web Activity)** - wraps PWA in APK
  - **Capacitor/Cordova** - wraps web app with native features
  - **Kotlin native** - separate codebase (more work)
- Distribute via: direct APK download, GitHub Releases, or F-Droid (free)

## API Key Strategy (3 tiers)

### Tier 1: Owner's Keys (Default - Friends & Family)
- Hidden API keys via secure backend router
- Users don't need to do anything
- Owner pays API costs
- Keys stored in backend environment variables, NEVER in client code

### Tier 2: BYOK (Bring Your Own Key)
- User enters their OpenAI-compatible API key in Settings
- Key stored ENCRYPTED locally (never sent to your backend)
- Supports: OpenAI, Groq, Together, local LLMs, etc.

### Tier 3: Puter.js (Free Fallback)
- Free AI API via Puter.js for users without keys
- Rate limited but functional
- Good fallback option

## User Memory & Personalization
- Store user profile locally:
  - Name, native language, level
  - Learning goals
  - Mistake history (categorized, not raw)
  - Exercise performance stats
- AI receives **compressed context** (not full history)
- Personalized exercise generation based on weak areas
- Adaptive difficulty

## TOKEN OPTIMIZATION (Critical - saves money)

### Reduce Output Tokens
- System prompt: "Be concise. Max 2-3 sentences unless explaining."
- Exercises: Return structured JSON, not prose
- Tutor: Short replies, ask if user wants more detail

### Reduce Input Tokens
- Compress user context into ~100-200 tokens max:
```

User: Maria, B1 level, goal: business English
Weak: articles, present perfect, false friends
Recent errors: "I am agree", "depend of"

```
- Don't send full conversation history, send summary
- Cache static prompts, only send dynamic parts

### Reduce API Requests
- Batch exercise generation (get 5-10 at once)
- Cache AI responses for common corrections
- Only call AI when necessary (use local logic first)
- Debounce typing in chat

## Feedback/Report System
- "Report" or "Suggestion" button in app
- Sends to serverless function (same Cloudflare Worker)
- Function emails owner via email service (Resend/SendGrid free tier)
- **Owner email stored in env vars, NEVER in client code**
- Include: user message, app version, timestamp

## Core Features
1. **AI Tutor Chat** - Always available, remembers user context
2. **Duolingo-style Exercises** - AI-generated, adaptive to user level
3. **Mistake Tracking** - Local DB, generates reinforcement exercises
4. **Spanish Speaker Focus** - Targets common errors

## Settings Screen
- API mode selector (Auto / My Keys / Puter.js)
- API Key input (if BYOK selected)
- API base URL option
- Test connection button
- User profile editor
- Clear data option

## Architecture
```

[Client App]
│
├─► Tier 1: Your Backend Router ─► AI API (your keys)
│
├─► Tier 2: Direct to OpenAI-compatible API (user's keys)
│
└─► Tier 3: Puter.js API (free fallback)

```

## Build Order
1. ~~Backend API router~~ ✅ Complete
2. Web app with tutor chat (in progress)
3. Exercise system
4. User memory/profiles
5. Android app

---

Read AGENTS.md and docs/ before starting.
```
