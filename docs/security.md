# Security - API Key Management

## 3-Tier API Strategy

### Tier 1: Owner's Keys (Free Serverless Backend)

Your personal keys for friends & family. Users get free access.

```
Client App → Serverless Function → AI Provider
              (keys in env vars)
```

**Free Hosting Options (no credit card needed):**

- Cloudflare Workers: 100k requests/DAY free
- Vercel: 100k requests/month free
- Netlify: 125k requests/month free

**Security:**

- Keys in platform environment variables (never in code)
- Backend validates requests before forwarding
- Rate limiting per user/IP
- Monitor for abuse

### Tier 2: BYOK (Bring Your Own Key)

User provides their own OpenAI-compatible key.

```
Client App → Direct to AI Provider (user's key)
```

**Security:**

- Key stored ENCRYPTED in local storage:
  - Web: `crypto.subtle` + localStorage/IndexedDB
  - Android: `EncryptedSharedPreferences`
- Key NEVER sent to your backend
- Key NEVER logged or transmitted elsewhere

#### BYOK Threat Model

> **Important**: The BYOK encryption provides **obfuscation**, not hard security.

| Threat                            | Protected? | Details                                              |
| --------------------------------- | ---------- | ---------------------------------------------------- |
| Casual inspection of localStorage | ✅ Yes     | Key is AES-GCM encrypted                             |
| Non-technical user snooping       | ✅ Yes     | Raw key not visible                                  |
| XSS attack on same origin         | ❌ No      | Attacker can read both ciphertext AND encryption key |
| Malicious browser extension       | ❌ No      | Extensions can access all page data                  |
| Device theft (unlocked)           | ❌ No      | Browser storage is accessible                        |

**Why this design?**

1. **Better than plaintext**: Prevents accidental exposure in DevTools screenshots
2. **Zero backend trust**: Key never leaves the browser
3. **User controls the key**: Can revoke/rotate anytime

**Recommended mitigations:**

- Implement strong Content Security Policy (CSP)
- Use Subresource Integrity (SRI) for scripts
- Regular security audits for XSS vulnerabilities
- Advise users to use keys with minimal permissions/quotas

### Tier 3: Puter.js (Free Fallback)

Free AI via Puter.js for users without keys.

```
Client App → Puter.js API (free, rate-limited)
```

**Security:**

- No keys needed
- Rate limited by Puter.js

## Files to NEVER Commit

```
.env
.env.local
.env.production
local.properties
*.keystore
```

## Backend .env Template

```bash
# Owner's API key - NEVER COMMIT
AI_API_KEY=sk-...

# Optional: multiple providers
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```
