@echo off
setlocal DisableDelayedExpansion

echo DEPLOYING AI EDUCATION MENTOR - IOT AGENT (WINDOWS)

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\init_env.ps1"
if errorlevel 1 exit /b 1

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="DB_PASSWORD" set "DB_PASSWORD=%%B"
    if "%%A"=="JWT_SECRET" set "JWT_SECRET=%%B"
    if "%%A"=="ENABLE_LOCAL_LLM" set "ENABLE_LOCAL_LLM=%%B"
    if "%%A"=="LOCAL_LLM_MODE" set "LOCAL_LLM_MODE=%%B"
    if "%%A"=="LOCAL_LLM_MODEL_FILE" set "LOCAL_LLM_MODEL_FILE=%%B"
    if "%%A"=="LOCAL_LLM_MODEL_URL" set "LOCAL_LLM_MODEL_URL=%%B"
    if "%%A"=="LOCAL_LLM_MODEL_SHA256" set "LOCAL_LLM_MODEL_SHA256=%%B"
    if "%%A"=="LOCAL_LLM_BASE_URL" set "LOCAL_LLM_BASE_URL=%%B"
    if "%%A"=="LOCAL_LLM_MODEL" set "LOCAL_LLM_MODEL=%%B"
    if "%%A"=="LOCAL_LLM_DISABLE_THINKING" set "LOCAL_LLM_DISABLE_THINKING=%%B"
    if "%%A"=="LOCAL_LLM_CONTEXT_SIZE" set "LOCAL_LLM_CONTEXT_SIZE=%%B"
    if "%%A"=="LOCAL_LLM_THREADS" set "LOCAL_LLM_THREADS=%%B"
    if "%%A"=="LOCAL_LLM_BATCH_SIZE" set "LOCAL_LLM_BATCH_SIZE=%%B"
    if "%%A"=="LOCAL_LLM_PARALLEL" set "LOCAL_LLM_PARALLEL=%%B"
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

if not defined ENABLE_LOCAL_LLM set "ENABLE_LOCAL_LLM=false"
if /i not "!ENABLE_LOCAL_LLM!"=="true" if /i not "!ENABLE_LOCAL_LLM!"=="false" (
    echo ERROR: ENABLE_LOCAL_LLM must be true or false.
    exit /b 1
)
if not defined LOCAL_LLM_MODE set "LOCAL_LLM_MODE=managed"
if /i not "!LOCAL_LLM_MODE!"=="managed" if /i not "!LOCAL_LLM_MODE!"=="external" (
    echo ERROR: LOCAL_LLM_MODE must be managed or external.
    exit /b 1
)
if defined LOCAL_LLM_DISABLE_THINKING if /i not "!LOCAL_LLM_DISABLE_THINKING!"=="true" if /i not "!LOCAL_LLM_DISABLE_THINKING!"=="false" (
    echo ERROR: LOCAL_LLM_DISABLE_THINKING must be empty, true or false.
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
if /i "!ENABLE_LOCAL_LLM!"=="true" if /i "!LOCAL_LLM_MODE!"=="managed" set "COMPOSE_PROFILE=--profile local-ai"
echo --> Validating Docker Compose configuration...
!COMPOSE! !COMPOSE_PROFILE! config --quiet
if errorlevel 1 exit /b 1

if /i "!ENABLE_LOCAL_LLM!"=="true" if /i "!LOCAL_LLM_MODE!"=="managed" (
    if not defined LOCAL_LLM_MODEL_FILE set "LOCAL_LLM_MODEL_FILE=Qwen3-1.7B-Q4_K_M.gguf"
    if not defined LOCAL_LLM_MODEL_URL set "LOCAL_LLM_MODEL_URL=https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf"

    if not exist "models" mkdir models
    echo --> Validating managed GGUF model...
    powershell -NoProfile -Command "$file = $env:LOCAL_LLM_MODEL_FILE; if ([string]::IsNullOrWhiteSpace($file) -or [IO.Path]::GetFileName($file) -ne $file -or $file -in '.', '..' -or [IO.Path]::GetExtension($file).ToLowerInvariant() -ne '.gguf') { throw 'LOCAL_LLM_MODEL_FILE must be a .gguf file name inside .\models, without path separators.' }; if ($env:LOCAL_LLM_BASE_URL -and $env:LOCAL_LLM_BASE_URL -ne 'http://local-llm:8080/v1') { throw 'LOCAL_LLM_BASE_URL must be empty in managed mode.' }; if ($env:LOCAL_LLM_MODEL_SHA256 -notmatch '^[0-9A-Fa-f]{64}$') { throw 'LOCAL_LLM_MODEL_SHA256 must contain the approved 64-character SHA256 in managed mode.' }; $limits = @{ LOCAL_LLM_CONTEXT_SIZE = @(512,131072); LOCAL_LLM_THREADS = @(1,256); LOCAL_LLM_BATCH_SIZE = @(1,8192); LOCAL_LLM_PARALLEL = @(1,16) }; foreach ($name in $limits.Keys) { $number = 0; $raw = [Environment]::GetEnvironmentVariable($name); if (-not [int]::TryParse($raw, [ref]$number) -or $number -lt $limits[$name][0] -or $number -gt $limits[$name][1]) { throw ($name + ' has an invalid integer value.') } }; $path = Join-Path 'models' $file; if (-not (Test-Path -LiteralPath $path)) { $uri = [Uri]$env:LOCAL_LLM_MODEL_URL; if ($uri.Scheme -ne 'https') { throw 'LOCAL_LLM_MODEL_URL must use HTTPS. For an offline install, copy the approved GGUF to .\models.' }; $part = $path + '.part'; Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue; try { Write-Host ('--> Downloading managed GGUF model (' + $file + ')...'); Invoke-WebRequest -Uri $uri -OutFile $part; $actual = (Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash; if ($actual -ne $env:LOCAL_LLM_MODEL_SHA256) { throw ('Local model checksum mismatch. Actual: ' + $actual) }; Move-Item -LiteralPath $part -Destination $path -Force } finally { Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue } } else { $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; if ($actual -ne $env:LOCAL_LLM_MODEL_SHA256) { throw ('Local model checksum mismatch. Actual: ' + $actual) }; Write-Host '--> Local GGUF model exists and checksum is valid.' }"
    if errorlevel 1 exit /b 1
) else if /i "!ENABLE_LOCAL_LLM!"=="true" (
    powershell -NoProfile -Command "$uri = $null; if (-not [Uri]::TryCreate($env:LOCAL_LLM_BASE_URL, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin 'http','https') { throw 'LOCAL_LLM_BASE_URL must be an HTTP(S) OpenAI-compatible /v1 endpoint in external mode.' }; if ($uri.IsLoopback) { throw 'localhost points to the AI Driver container; use host.docker.internal for a model server running on the Docker host.' }; if ([string]::IsNullOrWhiteSpace($env:LOCAL_LLM_MODEL)) { throw 'LOCAL_LLM_MODEL is required in external mode.' }"
    if errorlevel 1 exit /b 1
    echo --> Using external OpenAI-compatible local model endpoint.
) else (
    echo --> Local LLM is disabled; starting the platform without a neural model.
)

echo --> Building production images...
if /i "!ENABLE_LOCAL_LLM!"=="false" (
    rem Remove a managed local model left by an earlier deployment.
    rem The GGUF file is a bind mount and is not deleted.
    !COMPOSE! --profile local-ai rm -sf local-llm >nul 2>&1
)
if /i "!LOCAL_LLM_MODE!"=="external" (
    !COMPOSE! --profile local-ai rm -sf local-llm >nul 2>&1
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
if /i "!ENABLE_LOCAL_LLM!"=="true" if /i "!LOCAL_LLM_MODE!"=="managed" (
    call :wait_for_service local-llm
    if errorlevel 1 exit /b 1
)

if /i "!ENABLE_LOCAL_LLM!"=="true" (
    echo --> Verifying local model inference compatibility...
    !COMPOSE! !COMPOSE_PROFILE! exec -T ai-driver python -c "from backend.model_availability import verify_local_inference; raise SystemExit(0 if verify_local_inference() else 1)"
    if errorlevel 1 (
        echo ERROR: The configured local model endpoint did not complete a minimal OpenAI-compatible chat request.
        exit /b 1
    )
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
