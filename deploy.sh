#!/usr/bin/env bash
set -e

echo "DEPLOYING AI EDUCATION MENTOR - IOT AGENT (LINUX/MAC)"

# Ensure execution from repository root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Environment configuration setup
FRONTEND_PORT="${FRONTEND_PORT:-80}" scripts/init_env.sh

while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
        DB_PASSWORD|JWT_SECRET|ENABLE_LOCAL_QWEN|QWEN_MODEL_FILE|QWEN_MODEL_URL|QWEN_MODEL_SHA256|FRONTEND_PORT|API_HOST_PORT)
            printf -v "$key" '%s' "$value"
            ;;
    esac
done < .env

if [ -z "${DB_PASSWORD:-}" ] || [ "$DB_PASSWORD" = "CHANGE_ME_STRONG_DATABASE_PASSWORD" ]; then
    echo "ERROR: Set a unique DB_PASSWORD in .env and rerun deploy.sh."
    exit 1
fi
if [ -z "${JWT_SECRET:-}" ] || [ "$JWT_SECRET" = "CHANGE_ME_MINIMUM_32_RANDOM_CHARACTERS" ] || [ "${#JWT_SECRET}" -lt 32 ]; then
    echo "ERROR: Set a unique JWT_SECRET of at least 32 characters in .env and rerun deploy.sh."
    exit 1
fi

# 2. Optional local AI model (Qwen3 GGUF)
ENABLE_LOCAL_QWEN="${ENABLE_LOCAL_QWEN:-false}"
ENABLE_LOCAL_QWEN_NORMALIZED="$(printf '%s' "$ENABLE_LOCAL_QWEN" | tr '[:upper:]' '[:lower:]')"
case "$ENABLE_LOCAL_QWEN_NORMALIZED" in
    true) ENABLE_LOCAL_QWEN=true ;;
    false) ENABLE_LOCAL_QWEN=false ;;
    *)
        echo "ERROR: ENABLE_LOCAL_QWEN must be true or false." >&2
        exit 1
        ;;
esac

if [ "$ENABLE_LOCAL_QWEN" = true ]; then
    mkdir -p models
    MODEL_FILE="${QWEN_MODEL_FILE:-Qwen3-1.7B-Q4_K_M.gguf}"
    MODEL_URL="${QWEN_MODEL_URL:-https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf}"
    MODEL_PATH="models/$MODEL_FILE"

    if [ ! -f "$MODEL_PATH" ]; then
        echo "--> Downloading local Qwen3 GGUF model ($MODEL_FILE)..."
        curl -fL --retry 3 -o "$MODEL_PATH" "$MODEL_URL"
        echo "--> Model downloaded successfully."
    else
        echo "--> Local GGUF model already exists in ./models, skipping download."
    fi

    if [ -z "${QWEN_MODEL_SHA256:-}" ] || ! [[ "$QWEN_MODEL_SHA256" =~ ^[0-9a-fA-F]{64}$ ]]; then
        echo "ERROR: QWEN_MODEL_SHA256 must contain the approved 64-character SHA256 when ENABLE_LOCAL_QWEN=true." >&2
        exit 1
    fi

    echo "--> Verifying Qwen model SHA256..."
    ACTUAL_SHA="$(shasum -a 256 "$MODEL_PATH" | awk '{print $1}')"
    ACTUAL_SHA_NORMALIZED="$(printf '%s' "$ACTUAL_SHA" | tr '[:upper:]' '[:lower:]')"
    EXPECTED_SHA_NORMALIZED="$(printf '%s' "$QWEN_MODEL_SHA256" | tr '[:upper:]' '[:lower:]')"
    if [ "$ACTUAL_SHA_NORMALIZED" != "$EXPECTED_SHA_NORMALIZED" ]; then
        echo "ERROR: Qwen model checksum mismatch."
        echo "Expected: $QWEN_MODEL_SHA256"
        echo "Actual:   $ACTUAL_SHA"
        exit 1
    fi
else
    echo "--> Local Qwen is disabled; starting the platform without a neural model."
fi

# 3. Docker Container Deployment
if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    echo "ERROR: Docker Compose is not installed." >&2
    exit 1
fi

PROFILE_ARGS=()
if [ "$ENABLE_LOCAL_QWEN" = true ]; then
    PROFILE_ARGS=(--profile local-ai)
else
    # Compose does not automatically stop a profile container left by an
    # earlier deployment. Remove only qwen-local; the GGUF bind mount remains.
    "${COMPOSE[@]}" --profile local-ai rm -sf qwen-local >/dev/null 2>&1 || true
fi

echo "--> Building production images..."
"${COMPOSE[@]}" "${PROFILE_ARGS[@]}" build

# Previous releases created the DataProtection volume while API Core ran as
# root. Migrate only this dedicated volume before starting the non-root image.
echo "--> Preparing persistent DataProtection key permissions..."
"${COMPOSE[@]}" "${PROFILE_ARGS[@]}" run --rm --no-deps --user root --entrypoint /bin/sh api-core \
    -c 'mkdir -p /var/lib/api-core/dataprotection-keys && chown -R app:app /var/lib/api-core/dataprotection-keys'

echo "--> Starting Docker containers..."
"${COMPOSE[@]}" "${PROFILE_ARGS[@]}" up --no-build -d --remove-orphans

echo "=================================================="
echo "DEPLOYMENT SUCCESSFUL!"
echo "Open application in browser: http://localhost:${FRONTEND_PORT:-80}/"
echo "Backend Swagger API:        http://127.0.0.1:${API_HOST_PORT:-5050}/swagger"
echo "AI-Driver FastAPI Docs:     http://localhost:8000/docs"
echo "=================================================="
