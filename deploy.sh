#!/usr/bin/env bash
set -e

echo "DEPLOYING AI REVIEW ANALYZER (OFFLINE/LOCAL)"

# Ensure execution from repository root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Environment configuration setup
if [ ! -f ".env" ]; then
    if [ -f "env_example.txt" ]; then
        echo "--> Creating .env from env_example.txt..."
        cp env_example.txt .env
    else
        echo "--> Creating default .env file..."
        cat <<EOT > .env
DB_HOST=postgres
DB_PORT=5432
DB_NAME=aichecker
DB_USER=aichecker_user
DB_PASSWORD=aichecker_password
JWT_SECRET=super_secret_jwt_key_aichecker_enterprise_2026!
JWT_ISSUER=ai-review-analyzer
JWT_AUDIENCE=ai-review-analyzer-frontend
JWT_EXPIRY_MINUTES=1440
DEEPSEEK_API_KEY=
SBERGPT_API_KEY=
VITE_OFFLINE_MODE=true
EOT
    fi
else
    echo "--> Existing .env file found."
fi

# 2. Local AI Model Download (Qwen GGUF)
mkdir -p models
MODEL_FILE="Qwen3.5-0.8B-Q8_0.gguf"
MODEL_PATH="models/$MODEL_FILE"

if [ ! -f "$MODEL_PATH" ]; then
    echo "--> Downloading local GGUF model ($MODEL_FILE)..."
    curl -L -o "$MODEL_PATH" "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf"
    echo "--> Model downloaded successfully."
else
    echo "--> Local GGUF model already exists in ./models, skipping download."
fi

# 3. Docker Container Deployment
echo "--> Starting Docker containers..."
docker compose down -v 2>/dev/null || true
docker compose up --build -d

echo "--> Cleaning up unused Docker images..."
docker image prune -f 2>/dev/null || true

echo "=================================================="
echo "DEPLOYMENT SUCCESSFUL!"
echo "Open application in browser: http://localhost/"
echo "=================================================="
