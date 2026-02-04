# Anglicus API - Setup Guide

This is the backend API router for Anglicus, built with Cloudflare Workers.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd api
   npm install
   ```

2. **Set up API keys for local development:**
   
   Create a `.dev.vars` file (already created with placeholders):
   ```bash
   # Edit api/.dev.vars and add your API keys
   ```

3. **Get free API keys (recommended):**

   - **OpenRouter** (RECOMMENDED - supports many providers with free models):
     - Sign up at https://openrouter.ai/
     - Get your key from https://openrouter.ai/keys
     - Add to `.dev.vars`: `OPENROUTER_API_KEY=sk-or-v1-...`
     - Free models available: `google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.1-8b-instruct:free`

   - **Groq** (very fast, free tier):
     - Sign up at https://console.groq.com/
     - Get your key from https://console.groq.com/keys
     - Add to `.dev.vars`: `GROQ_API_KEY=gsk_...`

   - **Cerebras** (fast inference):
     - Sign up at https://cloud.cerebras.ai/
     - Get your API key
     - Add to `.dev.vars`: `CEREBRAS_API_KEY=...`

   - **Google Gemini** (free tier):
     - Get your key from https://makersuite.google.com/app/apikey
     - Add to `.dev.vars`: `GEMINI_API_KEY=...`

4. **Run locally:**
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:8787`

5. **Test the API:**
   ```bash
   # Health check
   curl http://localhost:8787/

   # List available models
   curl http://localhost:8787/v1/models

   # Test chat completion
   curl -X POST http://localhost:8787/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "google/gemini-2.0-flash-exp:free",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

## Features

- **Multi-provider support**: OpenRouter, OpenAI, Groq, Gemini, Mistral, Cerebras, and more
- **Automatic failover**: If one provider is rate-limited, automatically tries the next available provider
- **OpenAI-compatible API**: Works with any OpenAI-compatible client
- **Rate limiting**: Built-in rate limiting per IP address
- **Free tier prioritization**: Automatically tries free-tier providers first

## Deployment

1. **Login to Cloudflare:**
   ```bash
   npx wrangler login
   ```

2. **Set up secrets (for production):**
   ```bash
   # Option 1: Use the setup script
   ./setup-secrets.sh  # Linux/Mac
   setup-secrets.bat   # Windows

   # Option 2: Set secrets manually
   echo "your-api-key" | npx wrangler secret put OPENROUTER_API_KEY
   echo "your-groq-key" | npx wrangler secret put GROQ_API_KEY
   ```

3. **Deploy:**
   ```bash
   npm run deploy
   ```

## Environment Variables

See `.dev.vars` for all available environment variables.

Required for basic functionality:
- At least one AI provider API key (OPENROUTER_API_KEY recommended)

Optional:
- `OWNER_EMAIL` - Your email for feedback
- `RESEND_API_KEY` - For sending feedback emails
- `RATE_LIMIT_PER_MINUTE` - Rate limit (default: 20)

## Automatic Provider Failover

The API automatically switches providers when:
- A provider returns a 429 (rate limit) error
- A provider returns a 5xx (server) error
- A provider is unavailable

Priority order (tries in this order):
1. OpenRouter (recommended - flexible, many free models)
2. Cerebras (very fast)
3. Groq (fast, free tier)
4. Mistral (free tier)
5. HuggingFace (free tier)
6. Nvidia (free tier)
7. Cohere (free tier)
8. Gemini (free tier)
9. Together AI
10. OpenAI

## Model Routing

The API automatically routes models to the appropriate provider:
- `gpt-4o`, `gpt-4o-mini`, etc. → OpenAI
- `llama-3.3-70b-versatile` → Groq
- `gemini-1.5-flash` → Google Gemini
- Models with `/` in the name → OpenRouter (e.g., `meta-llama/llama-3.1-8b-instruct:free`)
- Unknown models → OpenRouter (most flexible)

## Troubleshooting

**API returns "No API keys configured":**
- Make sure you've added at least one API key to `.dev.vars` (for local) or as a Cloudflare secret (for production)

**Connection test fails:**
- Check that the API is running (`npm run dev`)
- Verify your API keys are valid
- Check the console for error messages

**Rate limit errors:**
- The API will automatically try the next available provider
- If all providers are rate-limited, wait a few minutes and try again
- Consider getting API keys for multiple providers for better reliability
