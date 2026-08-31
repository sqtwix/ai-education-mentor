@echo off
setlocal DisableDelayedExpansion

echo DEPLOYING AI EDUCATION MENTOR - IOT AGENT (WINDOWS)

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\init_env.ps1"
if errorlevel 1 exit /b 1

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="DB_PASSWORD" set "DB_PASSWORD=%%B"
    if "%%A"=="JWT_SECRET" set "JWT_SECRET=%%B"
    if "%%A"=="ENABLE_LOCAL_QWEN" set "ENABLE_LOCAL_QWEN=%%B"
    if "%%A"=="QWEN_MODEL_FILE" set "QWEN_MODEL_FILE=%%B"
    if "%%A"=="QWEN_MODEL_URL" set "QWEN_MODEL_URL=%%B"
    if "%%A"=="QWEN_MODEL_SHA256" set "QWEN_MODEL_SHA256=%%B"
    if "%%A"=="FRONTEND_PORT" set "FRONTEND_PORT=%%B"
    if "%%A"=="API_HOST_PORT" set "API_HOST_PORT=%%B"
    if "%%A"=="AI_DRIVER_HOST_PORT" set "AI_DRIVER_HOST_PORT=%%B"
)

powershell -NoProfile -Command "if ([string]::IsNullOrWhiteSpace($env:DB_PASSWORD) -or $env:DB_PASSWORD -eq 'CHANGE_ME_STRONG_DATABASE_PASSWORD') { throw 'Set a unique DB_PASSWORD in .env and rerun deploy.bat.' }; if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET) -or $env:JWT_SECRET -eq 'CHANGE_ME_MINIMUM_32_RANDOM_CHARACTERS' -or $env:JWT_SECRET.Length -lt 32) { throw 'Set a unique JWT_SECRET of at least 32 characters in .env and rerun deploy.bat.' }"
if errorlevel 1 exit /b 1

setlocal EnableDelayedExpansion

if not defined FRONTEND_PORT set "FRONTEND_PORT=80"
if not defined API_HOST_PORT set "API_HOST_PORT=5050"
if not defined AI_DRIVER_HOST_PORT set "AI_DRIVER_HOST_PORT=8000"
powershell -NoProfile -Command "$names = 'FRONTEND_PORT','API_HOST_PORT','AI_DRIVER_HOST_PORT'; $values = @(); foreach ($name in $names) { $raw = [Environment]::GetEnvironmentVariable($name); $port = 0; if (-not [int]::TryParse($raw, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw ($name + ' must be an integer from 1 to 65535.') }; $values += $port }; if (($values | Select-Object -Unique).Count -ne 3) { throw 'FRONTEND_PORT, API_HOST_PORT and AI_DRIVER_HOST_PORT must be different.' }"
if errorlevel 1 exit /b 1

if not defined ENABLE_LOCAL_QWEN set "ENABLE_LOCAL_QWEN=false"
if /i not "!ENABLE_LOCAL_QWEN!"=="true" if /i not "!ENABLE_LOCAL_QWEN!"=="false" (
    echo ERROR: ENABLE_LOCAL_QWEN must be true or false.
    exit /b 1
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
    docker-compose version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: docker-compose is installed but cannot run.
        exit /b 1
    )
    set "COMPOSE=docker-compose"
)
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker Engine is unavailable. Start Docker and rerun deploy.bat.
    exit /b 1
)
set "COMPOSE_PROFILE="
if /i "!ENABLE_LOCAL_QWEN!"=="true" set "COMPOSE_PROFILE=--profile local-ai"
echo --> Validating Docker Compose configuration...
!COMPOSE! !COMPOSE_PROFILE! config --quiet
if errorlevel 1 exit /b 1

if /i "!ENABLE_LOCAL_QWEN!"=="true" (
    if not defined QWEN_MODEL_FILE set "QWEN_MODEL_FILE=Qwen3-1.7B-Q4_K_M.gguf"
    if not defined QWEN_MODEL_URL set "QWEN_MODEL_URL=https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf"

    if not exist "models" mkdir models
    echo --> Validating local Qwen model...
    powershell -NoProfile -Command "$file = $env:QWEN_MODEL_FILE; if ([string]::IsNullOrWhiteSpace($file) -or [IO.Path]::GetFileName($file) -ne $file -or $file -in '.', '..') { throw 'QWEN_MODEL_FILE must be a file name inside .\models, without path separators.' }; if ($env:QWEN_MODEL_SHA256 -notmatch '^[0-9A-Fa-f]{64}$') { throw 'QWEN_MODEL_SHA256 must contain the approved 64-character SHA256 when ENABLE_LOCAL_QWEN=true.' }; $path = Join-Path 'models' $file; if (-not (Test-Path -LiteralPath $path)) { $uri = [Uri]$env:QWEN_MODEL_URL; if ($uri.Scheme -ne 'https') { throw 'QWEN_MODEL_URL must use HTTPS. For an offline install, copy the approved file to .\models.' }; $part = $path + '.part'; Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue; try { Write-Host ('--> Downloading local Qwen3 GGUF model (' + $file + ')...'); Invoke-WebRequest -Uri $uri -OutFile $part; $actual = (Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash; if ($actual -ne $env:QWEN_MODEL_SHA256) { throw ('Qwen model checksum mismatch. Actual: ' + $actual) }; Move-Item -LiteralPath $part -Destination $path -Force } finally { Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue } } else { $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; if ($actual -ne $env:QWEN_MODEL_SHA256) { throw ('Qwen model checksum mismatch. Actual: ' + $actual) }; Write-Host '--> Local GGUF model exists and checksum is valid.' }"
    if errorlevel 1 exit /b 1
) else (
    echo --> Local Qwen is disabled; starting the platform without a neural model.
)

echo --> Building production images...
if /i "!ENABLE_LOCAL_QWEN!"=="false" (
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

echo --> Waiting for services to become healthy...
for %%S in (postgres ai-driver api-core frontend) do (
    call :wait_for_service %%S
    if errorlevel 1 exit /b 1
)
if /i "!ENABLE_LOCAL_QWEN!"=="true" (
    call :wait_for_service qwen-local
    if errorlevel 1 exit /b 1
)

echo ==================================================
echo DEPLOYMENT SUCCESSFUL!
echo Open application in browser: http://localhost:!FRONTEND_PORT!/
echo Backend Swagger API:        http://127.0.0.1:!API_HOST_PORT!/swagger
echo AI-Driver FastAPI Docs:     http://127.0.0.1:!AI_DRIVER_HOST_PORT!/docs
echo ==================================================
exit /b 0

:wait_for_service
set "WAIT_SERVICE=%~1"
for /l %%I in (1,1,150) do (
    set "WAIT_CONTAINER="
    for /f "usebackq delims=" %%C in (`!COMPOSE! !COMPOSE_PROFILE! ps -q !WAIT_SERVICE! 2^>nul`) do set "WAIT_CONTAINER=%%C"
    if defined WAIT_CONTAINER (
        for /f "usebackq delims=" %%H in (`docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" !WAIT_CONTAINER! 2^>nul`) do set "WAIT_STATE=%%H"
        if /i "!WAIT_STATE!"=="healthy" (
            echo     !WAIT_SERVICE!: healthy
            exit /b 0
        )
        if /i "!WAIT_STATE!"=="unhealthy" goto :service_failed
        if /i "!WAIT_STATE!"=="exited" goto :service_failed
        if /i "!WAIT_STATE!"=="dead" goto :service_failed
    )
    >nul ping 127.0.0.1 -n 3
)
echo ERROR: Timed out waiting for !WAIT_SERVICE!. Check: !COMPOSE! logs --tail=200 !WAIT_SERVICE!
exit /b 1

:service_failed
echo ERROR: !WAIT_SERVICE! entered state '!WAIT_STATE!'. Check: !COMPOSE! logs --tail=200 !WAIT_SERVICE!
exit /b 1
