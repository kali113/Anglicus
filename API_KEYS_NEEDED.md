# API Keys Required

## Quick Start

The API connection tests are failing because no API keys are configured yet.

### Option 1: Add Keys to `.dev.vars` (Local Development)

1. Open `api/.dev.vars` in a text editor
2. Replace the placeholder keys with your real API keys
3. Save the file
4. The API will automatically use these keys when running locally

### Option 2: Use Free API Keys

Get free API keys from these providers (no credit card required):

#### OpenRouter (RECOMMENDED - Easiest)
- Sign up: https://openrouter.ai/
- Get your key: https://openrouter.ai/keys
- Supports many models including free ones
- Add to `.dev.vars`: `OPENROUTER_API_KEY=sk-or-v1-your-key-here`

#### Groq (Very Fast, Free Tier)
- Sign up: https://console.groq.com/
- Get your key: https://console.groq.com/keys
- Free tier: 30 requests/minute
- Add to `.dev.vars`: `GROQ_API_KEY=gsk_your-key-here`

#### Google Gemini (Free Tier)
- Get your key: https://makersuite.google.com/app/apikey
- Free tier: 60 requests/minute
- Add to `.dev.vars`: `GEMINI_API_KEY=your-key-here`

#### Cerebras (Fast Inference)
- Sign up: https://cloud.cerebras.ai/
- Get your API key
- Add to `.dev.vars`: `CEREBRAS_API_KEY=your-key-here`

### How the API Router Works

The API automatically:
1. **Tries providers in priority order** (OpenRouter → Cerebras → Groq → etc.)
2. **Switches to next provider** when rate limited or if one fails
3. **Uses free-tier providers first** to minimize costs

You only need ONE API key to get started, but having multiple keys improves reliability!

### Testing

Once you've added at least one API key:

```bash
# Start the API
cd api
npm run dev

# Test from another terminal
curl http://localhost:8787/
curl http://localhost:8787/v1/models

# Test chat completion
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.1-8b", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### Where are my API keys you mentioned?

If you mentioned you have API keys attached, please:
1. Copy them to `api/.dev.vars` file
2. Make sure they're in the format shown above
3. Restart the API with `npm run dev`

The `.dev.vars` file is git-ignored, so your keys won't be committed to the repository.

### Need Help?

See `api/README.md` for detailed setup instructions and troubleshooting.
