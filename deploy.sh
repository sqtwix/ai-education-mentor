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
        DB_PASSWORD|JWT_SECRET|ENABLE_LOCAL_LLM|LOCAL_LLM_MODE|LOCAL_LLM_MODEL_FILE|LOCAL_LLM_MODEL_URL|LOCAL_LLM_MODEL_SHA256|LOCAL_LLM_BASE_URL|LOCAL_LLM_MODEL|LOCAL_LLM_DISABLE_THINKING|LOCAL_LLM_CONTEXT_SIZE|LOCAL_LLM_THREADS|LOCAL_LLM_BATCH_SIZE|LOCAL_LLM_PARALLEL|FRONTEND_PORT|API_HOST_PORT|AI_DRIVER_HOST_PORT)
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

# 2. Optional local/OpenAI-compatible model
ENABLE_LOCAL_LLM="${ENABLE_LOCAL_LLM:-false}"
ENABLE_LOCAL_LLM_NORMALIZED="$(printf '%s' "$ENABLE_LOCAL_LLM" | tr '[:upper:]' '[:lower:]')"
case "$ENABLE_LOCAL_LLM_NORMALIZED" in
    true) ENABLE_LOCAL_LLM=true ;;
    false) ENABLE_LOCAL_LLM=false ;;
    *)
        echo "ERROR: ENABLE_LOCAL_LLM must be true or false." >&2
        exit 1
        ;;
esac
LOCAL_LLM_MODE="$(printf '%s' "${LOCAL_LLM_MODE:-managed}" | tr '[:upper:]' '[:lower:]')"
case "$LOCAL_LLM_MODE" in
    managed|external) ;;
    *)
        echo "ERROR: LOCAL_LLM_MODE must be managed or external." >&2
        exit 1
        ;;
esac
if [ -n "${LOCAL_LLM_DISABLE_THINKING:-}" ]; then
    case "$(printf '%s' "$LOCAL_LLM_DISABLE_THINKING" | tr '[:upper:]' '[:lower:]')" in
        true|false) ;;
        *) echo "ERROR: LOCAL_LLM_DISABLE_THINKING must be empty, true or false." >&2; exit 1 ;;
    esac
fi

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
    if [ "$ENABLE_LOCAL_LLM" = true ] && [ "$LOCAL_LLM_MODE" = managed ]; then
        "${COMPOSE[@]}" --profile local-ai "$@"
    else
        "${COMPOSE[@]}" "$@"
    fi
}
echo "--> Validating Docker Compose configuration..."
compose_cmd config --quiet

if [ "$ENABLE_LOCAL_LLM" = true ] && [ "$LOCAL_LLM_MODE" = managed ]; then
    MODEL_FILE="${LOCAL_LLM_MODEL_FILE:-Qwen3-1.7B-Q4_K_M.gguf}"
    MODEL_URL="${LOCAL_LLM_MODEL_URL:-https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf}"
    MODEL_PATH="models/$MODEL_FILE"

    if [[ "$MODEL_FILE" == */* ]] || [[ "$MODEL_FILE" == *\\* ]] || [ "$MODEL_FILE" = "." ] || [ "$MODEL_FILE" = ".." ]; then
        echo "ERROR: LOCAL_LLM_MODEL_FILE must be a file name inside ./models, without path separators." >&2
        exit 1
    fi
    case "$MODEL_FILE" in
        *.gguf|*.GGUF) ;;
        *) echo "ERROR: managed local models must use the .gguf extension." >&2; exit 1 ;;
    esac
    if [ -n "${LOCAL_LLM_BASE_URL:-}" ] && [ "$LOCAL_LLM_BASE_URL" != "http://local-llm:8080/v1" ]; then
        echo "ERROR: LOCAL_LLM_BASE_URL must be empty in managed mode; use external mode for another endpoint." >&2
        exit 1
    fi
    if [ -z "${LOCAL_LLM_MODEL_SHA256:-}" ] || ! [[ "$LOCAL_LLM_MODEL_SHA256" =~ ^[0-9a-fA-F]{64}$ ]]; then
        echo "ERROR: LOCAL_LLM_MODEL_SHA256 must contain the approved 64-character SHA256 in managed mode." >&2
        exit 1
    fi
    validate_managed_number() {
        local name="$1" value="$2" minimum="$3" maximum="$4"
        if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt "$minimum" ] || [ "$value" -gt "$maximum" ]; then
            echo "ERROR: ${name} must be an integer from ${minimum} to ${maximum}." >&2
            exit 1
        fi
    }
    validate_managed_number LOCAL_LLM_CONTEXT_SIZE "${LOCAL_LLM_CONTEXT_SIZE:-4096}" 512 131072
    validate_managed_number LOCAL_LLM_THREADS "${LOCAL_LLM_THREADS:-4}" 1 256
    validate_managed_number LOCAL_LLM_BATCH_SIZE "${LOCAL_LLM_BATCH_SIZE:-512}" 1 8192
    validate_managed_number LOCAL_LLM_PARALLEL "${LOCAL_LLM_PARALLEL:-1}" 1 16

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

    EXPECTED_SHA_NORMALIZED="$(printf '%s' "$LOCAL_LLM_MODEL_SHA256" | tr '[:upper:]' '[:lower:]')"
    mkdir -p models
    if [ ! -f "$MODEL_PATH" ]; then
        if [[ "$MODEL_URL" != https://* ]]; then
            echo "ERROR: LOCAL_LLM_MODEL_URL must use HTTPS. For an offline install, copy the approved GGUF to ./models." >&2
            exit 1
        fi
        if ! command -v curl >/dev/null 2>&1; then
            echo "ERROR: curl is required to download the local model." >&2
            exit 1
        fi
        echo "--> Downloading managed GGUF model ($MODEL_FILE)..."
        MODEL_PART="${MODEL_PATH}.part"
        trap 'rm -f "${MODEL_PART:-}"' EXIT
        rm -f "$MODEL_PART"
        curl --fail --location --retry 3 --proto '=https' --output "$MODEL_PART" "$MODEL_URL"
        ACTUAL_SHA="$(calculate_sha256 "$MODEL_PART")"
        ACTUAL_SHA_NORMALIZED="$(printf '%s' "$ACTUAL_SHA" | tr '[:upper:]' '[:lower:]')"
        if [ "$ACTUAL_SHA_NORMALIZED" != "$EXPECTED_SHA_NORMALIZED" ]; then
            echo "ERROR: Downloaded local model checksum mismatch." >&2
            echo "Expected: $LOCAL_LLM_MODEL_SHA256" >&2
            echo "Actual:   $ACTUAL_SHA" >&2
            exit 1
        fi
        mv "$MODEL_PART" "$MODEL_PATH"
        trap - EXIT
        echo "--> Model downloaded successfully."
    else
        echo "--> Local GGUF model already exists in ./models, skipping download."
    fi

    echo "--> Verifying local model SHA256..."
    ACTUAL_SHA="$(calculate_sha256 "$MODEL_PATH")"
    ACTUAL_SHA_NORMALIZED="$(printf '%s' "$ACTUAL_SHA" | tr '[:upper:]' '[:lower:]')"
    if [ "$ACTUAL_SHA_NORMALIZED" != "$EXPECTED_SHA_NORMALIZED" ]; then
        echo "ERROR: Local model checksum mismatch."
        echo "Expected: $LOCAL_LLM_MODEL_SHA256"
        echo "Actual:   $ACTUAL_SHA"
        exit 1
    fi
elif [ "$ENABLE_LOCAL_LLM" = true ]; then
    if [[ "${LOCAL_LLM_BASE_URL:-}" != http://* ]] && [[ "${LOCAL_LLM_BASE_URL:-}" != https://* ]]; then
        echo "ERROR: LOCAL_LLM_BASE_URL must be an HTTP(S) OpenAI-compatible /v1 endpoint in external mode." >&2
        exit 1
    fi
    case "$LOCAL_LLM_BASE_URL" in
        http://localhost*|https://localhost*|http://127.0.0.1*|https://127.0.0.1*|http://\[::1\]*|https://\[::1\]*)
            echo "ERROR: localhost in LOCAL_LLM_BASE_URL points to the AI Driver container. Use host.docker.internal for a model server running on the Docker host." >&2
            exit 1
            ;;
    esac
    if [ -z "${LOCAL_LLM_MODEL:-}" ]; then
        echo "ERROR: LOCAL_LLM_MODEL is required in external mode." >&2
        exit 1
    fi
    echo "--> Using external OpenAI-compatible local model endpoint."
else
    echo "--> Local LLM is disabled; starting the platform without a neural model."
fi

# 3. Docker Container Deployment
if [ "$ENABLE_LOCAL_LLM" = false ] || [ "$LOCAL_LLM_MODE" = external ]; then
    # Stop a managed model left by an earlier deployment. The GGUF bind mount
    # and all persistent application volumes remain untouched.
    "${COMPOSE[@]}" --profile local-ai rm -sf local-llm >/dev/null 2>&1 || true
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
if [ "$ENABLE_LOCAL_LLM" = true ] && [ "$LOCAL_LLM_MODE" = managed ]; then
    SERVICES+=(local-llm)
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

if [ "$ENABLE_LOCAL_LLM" = true ]; then
    echo "--> Verifying local model inference compatibility..."
    if ! compose_cmd exec -T ai-driver python -c \
        'from backend.model_availability import verify_local_inference; raise SystemExit(0 if verify_local_inference() else 1)'; then
        echo "ERROR: The configured local model endpoint did not complete a minimal OpenAI-compatible chat request." >&2
        exit 1
    fi
fi

echo "=================================================="
echo "DEPLOYMENT SUCCESSFUL!"
echo "Open application in browser: http://localhost:${FRONTEND_PORT}/"
echo "Backend Swagger API:        http://127.0.0.1:${API_HOST_PORT}/swagger"
echo "AI-Driver FastAPI Docs:     http://127.0.0.1:${AI_DRIVER_HOST_PORT}/docs"
echo "=================================================="
