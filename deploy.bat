@echo off
setlocal enabledelayedexpansion

echo DEPLOYING AI EDUCATION MENTOR - IOT AGENT (WINDOWS)

cd /d "%~dp0"

if not exist ".env" (
    if exist "env_example.txt" (
        echo --> Creating .env from env_example.txt...
        copy env_example.txt .env >nul
    ) else (
        echo --> Creating default .env file...
        (
            echo DB_HOST=postgres
            echo DB_PORT=5432
            echo DB_NAME=aichecker
            echo DB_USER=aichecker_user
            echo DB_PASSWORD=aichecker_password
            echo JWT_SECRET=super_secret_jwt_key_aichecker_enterprise_2026!
            echo JWT_ISSUER=ai-education-mentor
            echo JWT_AUDIENCE=ai-education-mentor-frontend
            echo JWT_EXPIRY_MINUTES=1440
            echo DEEPSEEK_API_KEY=
            echo SBERGPT_API_KEY=
            echo VITE_OFFLINE_MODE=false
        ) > .env
    )
) else (
    echo --> Existing .env file found.
)

if not exist "models" mkdir models

set "MODEL_FILE=qwen2.5-0.5b-instruct-q8_0.gguf"
set "MODEL_PATH=models\%MODEL_FILE%"
if not exist "%MODEL_PATH%" (
    echo --> Downloading local Qwen2.5 GGUF model (%MODEL_FILE%)...
    powershell -Command "Invoke-WebRequest -Uri 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf' -OutFile 'models\%MODEL_FILE%'"
    echo --> Model downloaded successfully.
) else (
    echo --> Local GGUF model already exists in .\models, skipping download.
)

echo --> Starting Docker containers...
docker compose down 2>nul
docker compose up --build -d

echo ==================================================
echo DEPLOYMENT SUCCESSFUL!
echo Open application in browser: http://localhost/
echo Backend Swagger API:        http://localhost:5000/swagger
echo AI-Driver FastAPI Docs:     http://localhost:8000/docs
echo ==================================================
pause
