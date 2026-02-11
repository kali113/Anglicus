@echo off
REM Anglicus API - Cloudflare Workers Secrets Setup Script (Windows)
REM This script helps you configure all the API keys as secrets in Cloudflare Workers

echo === Anglicus API - Secrets Setup ===
echo.
echo This script will prompt you to enter your API keys.
echo Each key will be stored securely as a Cloudflare Worker secret.
echo.
echo Available secrets to configure:
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
echo   - JWT_SECRET          (JWT signing secret)
echo   - EMAIL_PEPPER        (Email hashing pepper)
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

choice /m "%PROMPT_TEXT%"
if errorlevel 2 (
    echo [SKIP] %SECRET_NAME% skipped
    echo.
    exit /b 0
)

echo Setting %SECRET_NAME%...
echo Please enter the value in the prompt that appears.
wrangler secret put %SECRET_NAME%
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] %SECRET_NAME% failed
) else (
    echo [OK] %SECRET_NAME% configured
)

echo.
exit /b 0

call :set_secret "OPENAI_API_KEY" "Set OpenAI API key (skip if not using)"
call :set_secret "GROQ_API_KEY" "Set Groq API key"
call :set_secret "TOGETHER_API_KEY" "Set Together AI API key"
call :set_secret "GEMINI_API_KEY" "Set Gemini API key"
call :set_secret "MISTRAL_API_KEY" "Set Mistral API key"
call :set_secret "COHERE_API_KEY" "Set Cohere API key"
call :set_secret "NVIDIA_API_KEY" "Set Nvidia API key"
call :set_secret "HUGGINGFACE_API_KEY" "Set Hugging Face API key"
call :set_secret "CLOUDFLARE_API_KEY" "Set Cloudflare API key (for Workers AI)"
call :set_secret "CLOUDFLARE_ACCOUNT_ID" "Set Cloudflare Account ID (for Workers AI)"
call :set_secret "OLLAMA_API_KEY" "Set Ollama API key (optional - for local instances)"
call :set_secret "OPENCODE_API_KEY" "Set OpenCode API key (optional)"
call :set_secret "CEREBRAS_API_KEY" "Set Cerebras API key"
call :set_secret "RESEND_API_KEY" "Set Resend API key (for feedback emails)"
call :set_secret "JWT_SECRET" "Set JWT secret (64+ random chars)"
call :set_secret "EMAIL_PEPPER" "Set email pepper (32+ random chars)"
call :set_secret "OWNER_EMAIL" "Set owner email address (feedback recipient)"

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
