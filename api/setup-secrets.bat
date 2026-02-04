@echo off
REM Anglicus API - Cloudflare Workers Secrets Setup Script (Windows)
REM This script helps you configure all the API keys as secrets in Cloudflare Workers

echo === Anglicus API - Secrets Setup ===
echo.
echo This script will prompt you to enter your API keys.
echo Each key will be stored securely as a Cloudflare Worker secret.
echo.
echo Available secrets to configure:
echo   - OPENROUTER_API_KEY  (OpenRouter - RECOMMENDED, supports many providers)
echo   - OPENAI_API_KEY      (OpenAI)
echo   - GROQ_API_KEY        (Groq)
echo   - TOGETHER_API_KEY    (Together AI)
echo   - GEMINI_API_KEY      (Google Gemini)
echo   - MISTRAL_API_KEY     (Mistral AI)
echo   - COHERE_API_KEY      (Cohere)
echo   - NVIDIA_API_KEY      (Nvidia)
echo   - HUGGINGFACE_API_KEY (Hugging Face)
echo   - CLOUDFLARE_API_KEY  (Cloudflare AI)
echo   - CLOUDFLARE_ACCOUNT_ID (for Cloudflare AI Workers AI)
echo   - OLLAMA_API_KEY      (Ollama - optional, for local)
echo   - OPENCODE_API_KEY    (OpenCode - optional)
echo   - CEREBRAS_API_KEY    (Cerebras)
echo   - RESEND_API_KEY      (Resend - for feedback emails)
echo   - OWNER_EMAIL         (Your email for feedback)
echo.

REM Check if wrangler is installed
where wrangler >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: wrangler is not installed.
    echo Please install it first: npm install -g wrangler
    pause
    exit /b 1
)

REM Check if logged in
echo Checking Cloudflare authentication...
wrangler whoami >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Please log in to Cloudflare first:
    wrangler login
)

echo.
echo === Configuration ===
echo.

:set_secret
set "SECRET_NAME=%~1"
set "PROMPT_TEXT=%~2"

set /p "SECRET_VALUE=%PROMPT_TEXT%: "

if not "%SECRET_VALUE%"=="" (
    echo Setting %SECRET_NAME%...
    echo %SECRET_VALUE% | wrangler secret put %SECRET_NAME%
    echo [OK] %SECRET_NAME% configured
) else (
    echo [SKIP] %SECRET_NAME% skipped
)

echo.

call :set_secret "OPENROUTER_API_KEY" "Enter OpenRouter API key (RECOMMENDED - supports many providers)"
call :set_secret "OPENAI_API_KEY" "Enter OpenAI API key (skip if not using)"
call :set_secret "GROQ_API_KEY" "Enter Groq API key"
call :set_secret "TOGETHER_API_KEY" "Enter Together AI API key"
call :set_secret "GEMINI_API_KEY" "Enter Gemini API key"
call :set_secret "MISTRAL_API_KEY" "Enter Mistral API key"
call :set_secret "COHERE_API_KEY" "Enter Cohere API key"
call :set_secret "NVIDIA_API_KEY" "Enter Nvidia API key"
call :set_secret "HUGGINGFACE_API_KEY" "Enter Hugging Face API key"
call :set_secret "CLOUDFLARE_API_KEY" "Enter Cloudflare API key (for Workers AI)"
call :set_secret "CLOUDFLARE_ACCOUNT_ID" "Enter Cloudflare Account ID (for Workers AI)"
call :set_secret "OLLAMA_API_KEY" "Enter Ollama API key (optional - for local instances)"
call :set_secret "OPENCODE_API_KEY" "Enter OpenCode API key (optional)"
call :set_secret "CEREBRAS_API_KEY" "Enter Cerebras API key"
call :set_secret "RESEND_API_KEY" "Enter Resend API key (for feedback emails)"

set /p "OWNER_EMAIL_VALUE=Enter your email address (for receiving feedback): "
if not "%OWNER_EMAIL_VALUE%"=="" (
    echo %OWNER_EMAIL_VALUE% | wrangler secret put OWNER_EMAIL
    echo [OK] OWNER_EMAIL configured
)

echo.
echo === Setup Complete ===
echo.
echo To deploy your worker, run:
echo   cd api ^&^& wrangler deploy
echo.
echo To test locally, run:
echo   cd api ^&^& wrangler dev
echo.
pause
