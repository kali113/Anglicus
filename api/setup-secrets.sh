#!/bin/bash
# Anglicus API - Cloudflare Workers Secrets Setup Script
# This script helps you configure all the API keys as secrets in Cloudflare Workers

echo "=== Anglicus API - Secrets Setup ==="
echo ""
echo "This script will prompt you to enter your API keys."
echo "Each key will be stored securely as a Cloudflare Worker secret."
echo ""
echo "Available secrets to configure:"
echo "  - OPENAI_API_KEY      (OpenAI)"
echo "  - GROQ_API_KEY        (Groq)"
echo "  - TOGETHER_API_KEY    (Together AI)"
echo "  - GEMINI_API_KEY      (Google Gemini)"
echo "  - MISTRAL_API_KEY     (Mistral AI)"
echo "  - COHERE_API_KEY      (Cohere)"
echo "  - NVIDIA_API_KEY      (Nvidia)"
echo "  - HUGGINGFACE_API_KEY (Hugging Face)"
echo "  - CLOUDFLARE_API_KEY  (Cloudflare AI)"
echo "  - CLOUDFLARE_ACCOUNT_ID (for Cloudflare AI Workers AI)"
echo "  - OLLAMA_API_KEY      (Ollama - optional, for local)"
echo "  - OPENCODE_API_KEY    (OpenCode - optional)"
echo "  - CEREBRAS_API_KEY    (Cerebras)"
echo "  - RESEND_API_KEY      (Resend - for feedback emails)"
echo "  - OWNER_EMAIL         (Your email for feedback)"
echo ""

# Function to set a secret
set_secret() {
  local secret_name=$1
  local prompt_text=$2

  echo -n "${prompt_text}: "
  read -s secret_value
  echo ""

  if [ -n "$secret_value" ]; then
    echo "Setting ${secret_name}..."
    echo "$secret_value" | wrangler secret put "$secret_name"
    echo "✓ ${secret_name} configured"
  else
    echo "⊘ ${secret_name} skipped"
  fi
}

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo "Error: wrangler is not installed."
  echo "Please install it first: npm install -g wrangler"
  exit 1
fi

# Check if logged in
echo "Checking Cloudflare authentication..."
wrangler whoami 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please log in to Cloudflare first:"
  wrangler login
fi

echo ""
echo "=== Configuration ==="
echo ""

# AI Provider Keys
set_secret "OPENAI_API_KEY" "Enter OpenAI API key (skip if not using)"
set_secret "GROQ_API_KEY" "Enter Groq API key"
set_secret "TOGETHER_API_KEY" "Enter Together AI API key"
set_secret "GEMINI_API_KEY" "Enter Gemini API key"
set_secret "MISTRAL_API_KEY" "Enter Mistral API key"
set_secret "COHERE_API_KEY" "Enter Cohere API key"
set_secret "NVIDIA_API_KEY" "Enter Nvidia API key"
set_secret "HUGGINGFACE_API_KEY" "Enter Hugging Face API key"
set_secret "CLOUDFLARE_API_KEY" "Enter Cloudflare API key (for Workers AI)"
set_secret "CLOUDFLARE_ACCOUNT_ID" "Enter Cloudflare Account ID (for Workers AI)"
set_secret "OLLAMA_API_KEY" "Enter Ollama API key (optional - for local instances)"
set_secret "OPENCODE_API_KEY" "Enter OpenCode API key (optional)"
set_secret "CEREBRAS_API_KEY" "Enter Cerebras API key"

# Feedback Configuration
set_secret "RESEND_API_KEY" "Enter Resend API key (for feedback emails)"
echo -n "Enter your email address (for receiving feedback): "
read owner_email
if [ -n "$owner_email" ]; then
  echo "$owner_email" | wrangler secret put OWNER_EMAIL
  echo "✓ OWNER_EMAIL configured"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To deploy your worker, run:"
echo "  cd api && wrangler deploy"
echo ""
echo "To test locally, run:"
echo "  cd api && wrangler dev"
