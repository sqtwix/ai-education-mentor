@echo off
setlocal enabledelayedexpansion

echo DEPLOYING AI EDUCATION MENTOR - IOT AGENT (WINDOWS)

cd /d "%~dp0"

if not exist ".env" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\init_env.ps1"
    if errorlevel 1 exit /b 1
) else (
    echo --> Existing .env file found.
)

if not exist "models" mkdir models

rem init_env.ps1 only creates .env once and never rewrites an existing file,
rem so an .env generated before new keys were added to env_example.txt (e.g.
rem the QWEN_MODEL_* variables) would silently keep missing them forever.
rem Backfill any keys present in the template but absent from .env, without
rem touching keys that are already set (secrets included).
powershell -NoProfile -Command "$path = '.env'; if ((Get-Item -LiteralPath $path).Length -gt 0) { $bytes = [IO.File]::ReadAllBytes($path); if ($bytes[-1] -ne 10) { [IO.File]::AppendAllText($path, [Environment]::NewLine) } }"
if errorlevel 1 exit /b 1

for /f "usebackq delims=" %%L in ("env_example.txt") do (
    set "tmpl_line=%%L"
    if not "!tmpl_line!"=="" if not "!tmpl_line:~0,1!"=="#" (
        for /f "tokens=1 delims==" %%K in ("!tmpl_line!") do set "tmpl_key=%%K"
        findstr /b /c:"!tmpl_key!=" ".env" >nul
        if errorlevel 1 (
            >>".env" echo(!tmpl_line!
            echo --> Added missing !tmpl_key! to .env ^(default from env_example.txt^).
        )
    )
)

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="DB_PASSWORD" set "DB_PASSWORD=%%B"
    if "%%A"=="JWT_SECRET" set "JWT_SECRET=%%B"
    if "%%A"=="ENABLE_LOCAL_QWEN" set "ENABLE_LOCAL_QWEN=%%B"
    if "%%A"=="QWEN_MODEL_FILE" set "QWEN_MODEL_FILE=%%B"
    if "%%A"=="QWEN_MODEL_URL" set "QWEN_MODEL_URL=%%B"
    if "%%A"=="QWEN_MODEL_SHA256" set "QWEN_MODEL_SHA256=%%B"
    if "%%A"=="FRONTEND_PORT" set "FRONTEND_PORT=%%B"
)

if not defined DB_PASSWORD (
    echo ERROR: Set a unique DB_PASSWORD in .env and rerun deploy.bat.
    exit /b 1
)
if /i "!DB_PASSWORD!"=="CHANGE_ME_STRONG_DATABASE_PASSWORD" (
    echo ERROR: Set a unique DB_PASSWORD in .env and rerun deploy.bat.
    exit /b 1
)
if not defined JWT_SECRET (
    echo ERROR: Set a unique JWT_SECRET of at least 32 characters in .env and rerun deploy.bat.
    exit /b 1
)
if /i "!JWT_SECRET!"=="CHANGE_ME_MINIMUM_32_RANDOM_CHARACTERS" (
    echo ERROR: Set a unique JWT_SECRET of at least 32 characters in .env and rerun deploy.bat.
    exit /b 1
)
if "!JWT_SECRET:~31,1!"=="" (
    echo ERROR: Set a unique JWT_SECRET of at least 32 characters in .env and rerun deploy.bat.
    exit /b 1
)

if not defined ENABLE_LOCAL_QWEN set "ENABLE_LOCAL_QWEN=false"
if /i not "%ENABLE_LOCAL_QWEN%"=="true" if /i not "%ENABLE_LOCAL_QWEN%"=="false" (
    echo ERROR: ENABLE_LOCAL_QWEN must be true or false.
    exit /b 1
)

if /i "%ENABLE_LOCAL_QWEN%"=="true" (
    if not defined QWEN_MODEL_FILE set "QWEN_MODEL_FILE=Qwen3-1.7B-Q4_K_M.gguf"
    if not defined QWEN_MODEL_URL set "QWEN_MODEL_URL=https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf"

    set "MODEL_FILE=!QWEN_MODEL_FILE!"
    set "MODEL_PATH=models\!MODEL_FILE!"
    if not exist "!MODEL_PATH!" (
        echo --> Downloading local Qwen3 GGUF model (!MODEL_FILE!)...
        powershell -Command "Invoke-WebRequest -Uri '!QWEN_MODEL_URL!' -OutFile '!MODEL_PATH!'"
        if errorlevel 1 exit /b 1
        echo --> Model downloaded successfully.
    ) else (
        echo --> Local GGUF model already exists in .\models, skipping download.
    )

    if not defined QWEN_MODEL_SHA256 (
        echo ERROR: QWEN_MODEL_SHA256 must contain the approved SHA256 when ENABLE_LOCAL_QWEN=true.
        exit /b 1
    )
    if "!QWEN_MODEL_SHA256:~63,1!"=="" (
        echo ERROR: QWEN_MODEL_SHA256 must contain 64 hexadecimal characters.
        exit /b 1
    )
    if not "!QWEN_MODEL_SHA256:~64,1!"=="" (
        echo ERROR: QWEN_MODEL_SHA256 must contain 64 hexadecimal characters.
        exit /b 1
    )
    echo --> Verifying Qwen model SHA256...
    for /f "tokens=1" %%H in ('certutil -hashfile "!MODEL_PATH!" SHA256 ^| findstr /r "^[0-9A-Fa-f][0-9A-Fa-f]"') do set "ACTUAL_SHA=%%H"
    if /i not "!ACTUAL_SHA!"=="!QWEN_MODEL_SHA256!" (
        echo ERROR: Qwen model checksum mismatch.
        echo Expected: !QWEN_MODEL_SHA256!
        echo Actual:   !ACTUAL_SHA!
        exit /b 1
    )
) else (
    echo --> Local Qwen is disabled; starting the platform without a neural model.
)

docker compose version >nul 2>&1
if not errorlevel 1 (
    set "COMPOSE=docker compose"
) else (
    where docker-compose >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Docker Compose is not installed.
        exit /b 1
    )
    set "COMPOSE=docker-compose"
)
echo --> Building production images...
set "COMPOSE_PROFILE="
if /i "%ENABLE_LOCAL_QWEN%"=="true" (
    set "COMPOSE_PROFILE=--profile local-ai"
) else (
    rem Remove a qwen-local container left by an earlier local-ai deployment.
    rem The GGUF file is a bind mount and is not deleted.
    !COMPOSE! --profile local-ai rm -sf qwen-local >nul 2>&1
)
!COMPOSE! !COMPOSE_PROFILE! build
if errorlevel 1 exit /b 1

rem Previous releases created the DataProtection volume while API Core ran as
rem root. Migrate only this dedicated volume before the non-root API starts.
echo --> Preparing persistent DataProtection key permissions...
!COMPOSE! !COMPOSE_PROFILE! run --rm --no-deps --user root --entrypoint /bin/sh api-core -c "mkdir -p /var/lib/api-core/dataprotection-keys && chown -R app:app /var/lib/api-core/dataprotection-keys"
if errorlevel 1 exit /b 1

echo --> Starting Docker containers...
!COMPOSE! !COMPOSE_PROFILE! up --no-build -d --remove-orphans
if errorlevel 1 exit /b 1

echo ==================================================
echo DEPLOYMENT SUCCESSFUL!
if not defined FRONTEND_PORT set "FRONTEND_PORT=80"
echo Open application in browser: http://localhost:!FRONTEND_PORT!/
echo Backend Swagger API:        http://127.0.0.1:5050/swagger
echo AI-Driver FastAPI Docs:     http://localhost:8000/docs
echo ==================================================
pause
