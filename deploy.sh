#!/usr/bin/env bash
set -euo pipefail

echo "DEPLOYING AI EDUCATION MENTOR - IOT AGENT (LINUX/MAC)"

# Ensure execution from repository root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Environment configuration setup
FRONTEND_PORT="${FRONTEND_PORT:-80}" "$SCRIPT_DIR/scripts/init_env.sh"

while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
        DB_PASSWORD|JWT_SECRET|ENABLE_LOCAL_QWEN|QWEN_MODEL_FILE|QWEN_MODEL_URL|QWEN_MODEL_SHA256|FRONTEND_PORT|API_HOST_PORT|AI_DRIVER_HOST_PORT)
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

validate_port() {
    local name="$1"
    local value="$2"
    if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
        echo "ERROR: ${name} must be an integer from 1 to 65535." >&2
        exit 1
    fi
}

FRONTEND_PORT="${FRONTEND_PORT:-80}"
API_HOST_PORT="${API_HOST_PORT:-5050}"
AI_DRIVER_HOST_PORT="${AI_DRIVER_HOST_PORT:-8000}"
validate_port FRONTEND_PORT "$FRONTEND_PORT"
validate_port API_HOST_PORT "$API_HOST_PORT"
validate_port AI_DRIVER_HOST_PORT "$AI_DRIVER_HOST_PORT"
if [ "$FRONTEND_PORT" = "$API_HOST_PORT" ] || [ "$FRONTEND_PORT" = "$AI_DRIVER_HOST_PORT" ] || [ "$API_HOST_PORT" = "$AI_DRIVER_HOST_PORT" ]; then
    echo "ERROR: FRONTEND_PORT, API_HOST_PORT and AI_DRIVER_HOST_PORT must be different." >&2
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

# Resolve Compose once and validate the fully interpolated contract before
# downloading a model or building images.
if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    echo "ERROR: Docker Compose is not installed." >&2
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker Engine is unavailable. Start Docker and rerun deploy.sh." >&2
    exit 1
fi

compose_cmd() {
    if [ "$ENABLE_LOCAL_QWEN" = true ]; then
        "${COMPOSE[@]}" --profile local-ai "$@"
    else
        "${COMPOSE[@]}" "$@"
    fi
}
echo "--> Validating Docker Compose configuration..."
compose_cmd config --quiet

if [ "$ENABLE_LOCAL_QWEN" = true ]; then
    MODEL_FILE="${QWEN_MODEL_FILE:-Qwen3-1.7B-Q4_K_M.gguf}"
    MODEL_URL="${QWEN_MODEL_URL:-https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf}"
    MODEL_PATH="models/$MODEL_FILE"

    if [[ "$MODEL_FILE" == */* ]] || [[ "$MODEL_FILE" == *\\* ]] || [ "$MODEL_FILE" = "." ] || [ "$MODEL_FILE" = ".." ]; then
        echo "ERROR: QWEN_MODEL_FILE must be a file name inside ./models, without path separators." >&2
        exit 1
    fi
    if [ -z "${QWEN_MODEL_SHA256:-}" ] || ! [[ "$QWEN_MODEL_SHA256" =~ ^[0-9a-fA-F]{64}$ ]]; then
        echo "ERROR: QWEN_MODEL_SHA256 must contain the approved 64-character SHA256 when ENABLE_LOCAL_QWEN=true." >&2
        exit 1
    fi

    calculate_sha256() {
        local path="$1"
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum "$path" | awk '{print $1}'
        elif command -v shasum >/dev/null 2>&1; then
            shasum -a 256 "$path" | awk '{print $1}'
        else
            echo "ERROR: sha256sum or shasum is required to verify the local model." >&2
            return 1
        fi
    }

    EXPECTED_SHA_NORMALIZED="$(printf '%s' "$QWEN_MODEL_SHA256" | tr '[:upper:]' '[:lower:]')"
    mkdir -p models
    if [ ! -f "$MODEL_PATH" ]; then
        if [[ "$MODEL_URL" != https://* ]]; then
            echo "ERROR: QWEN_MODEL_URL must use HTTPS. For an offline install, copy the approved file to ./models." >&2
            exit 1
        fi
        if ! command -v curl >/dev/null 2>&1; then
            echo "ERROR: curl is required to download the local model." >&2
            exit 1
        fi
        echo "--> Downloading local Qwen3 GGUF model ($MODEL_FILE)..."
        MODEL_PART="${MODEL_PATH}.part"
        trap 'rm -f "${MODEL_PART:-}"' EXIT
        rm -f "$MODEL_PART"
        curl --fail --location --retry 3 --proto '=https' --output "$MODEL_PART" "$MODEL_URL"
        ACTUAL_SHA="$(calculate_sha256 "$MODEL_PART")"
        ACTUAL_SHA_NORMALIZED="$(printf '%s' "$ACTUAL_SHA" | tr '[:upper:]' '[:lower:]')"
        if [ "$ACTUAL_SHA_NORMALIZED" != "$EXPECTED_SHA_NORMALIZED" ]; then
            echo "ERROR: Downloaded Qwen model checksum mismatch." >&2
            echo "Expected: $QWEN_MODEL_SHA256" >&2
            echo "Actual:   $ACTUAL_SHA" >&2
            exit 1
        fi
        mv "$MODEL_PART" "$MODEL_PATH"
        trap - EXIT
        echo "--> Model downloaded successfully."
    else
        echo "--> Local GGUF model already exists in ./models, skipping download."
    fi

    echo "--> Verifying Qwen model SHA256..."
    ACTUAL_SHA="$(calculate_sha256 "$MODEL_PATH")"
    ACTUAL_SHA_NORMALIZED="$(printf '%s' "$ACTUAL_SHA" | tr '[:upper:]' '[:lower:]')"
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
if [ "$ENABLE_LOCAL_QWEN" = false ]; then
    # Compose does not automatically stop a profile container left by an
    # earlier deployment. Remove only qwen-local; the GGUF bind mount remains.
    "${COMPOSE[@]}" --profile local-ai rm -sf qwen-local >/dev/null 2>&1 || true
fi

echo "--> Building production images..."
compose_cmd build

# Previous releases created the DataProtection volume while API Core ran as
# root. Migrate only this dedicated volume before starting the non-root image.
echo "--> Preparing persistent DataProtection key permissions..."
compose_cmd run --rm --no-deps --user root --entrypoint /bin/sh api-core \
    -c 'mkdir -p /var/lib/api-core/dataprotection-keys && chown -R app:app /var/lib/api-core/dataprotection-keys'

echo "--> Starting Docker containers..."
compose_cmd up --no-build -d --remove-orphans

echo "--> Waiting for services to become healthy..."
SERVICES=(postgres ai-driver api-core frontend)
if [ "$ENABLE_LOCAL_QWEN" = true ]; then
    SERVICES+=(qwen-local)
fi
deadline=$((SECONDS + 300))
for service in "${SERVICES[@]}"; do
    while true; do
        container_id="$(compose_cmd ps -q "$service")"
        if [ -n "$container_id" ]; then
            health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
            if [ "$health_status" = "healthy" ]; then
                echo "    $service: healthy"
                break
            fi
            if [ "$health_status" = "unhealthy" ] || [ "$health_status" = "exited" ] || [ "$health_status" = "dead" ]; then
                echo "ERROR: $service entered state '$health_status'. Check: ${COMPOSE[*]} logs --tail=200 $service" >&2
                exit 1
            fi
        fi
        if [ "$SECONDS" -ge "$deadline" ]; then
            echo "ERROR: Timed out waiting for $service. Check: ${COMPOSE[*]} logs --tail=200 $service" >&2
            exit 1
        fi
        sleep 2
    done
done

echo "=================================================="
echo "DEPLOYMENT SUCCESSFUL!"
echo "Open application in browser: http://localhost:${FRONTEND_PORT}/"
echo "Backend Swagger API:        http://127.0.0.1:${API_HOST_PORT}/swagger"
echo "AI-Driver FastAPI Docs:     http://127.0.0.1:${AI_DRIVER_HOST_PORT}/docs"
echo "=================================================="
