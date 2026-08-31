#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${API_URL:-http://127.0.0.1:5050/api/v1}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_DIR")}"

for command_name in curl docker jq od; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "ERROR: $command_name is required." >&2
        exit 1
    fi
done

if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    echo "ERROR: Docker Compose is required." >&2
    exit 1
fi

cd "$PROJECT_DIR"
suffix="$(od -An -N 8 -tx1 /dev/urandom | tr -d ' \n')"
email="no-ai-smoke-$suffix@example.test"
password="NoAi-Smoke-$suffix!"
request_id="no-ai-smoke-$suffix"
work_dir="$(mktemp -d)"
response_file="$work_dir/response.json"

cleanup() {
    "${COMPOSE[@]}" exec -T postgres sh -lc \
        "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -c \"DELETE FROM analysis_reports WHERE id = '$request_id'; DELETE FROM users WHERE email = '$email';\"" \
        >/dev/null 2>&1 || true
    rm -rf "$work_dir"
}
trap cleanup EXIT

request_code() {
    local token="$1"
    local method="$2"
    local path="$3"
    local payload="${4:-}"
    local -a arguments=(-sS -o "$response_file" -w '%{http_code}' -X "$method")
    if [ -n "$token" ]; then
        arguments+=(-H "Authorization: Bearer $token")
    fi
    if [ -n "$payload" ]; then
        arguments+=(-H 'Content-Type: application/json' --data "$payload")
    fi
    curl "${arguments[@]}" "$API_URL$path"
}

assert_code() {
    local expected="$1"
    local actual="$2"
    local label="$3"
    if [ "$actual" != "$expected" ]; then
        echo "ERROR: $label returned HTTP $actual, expected $expected." >&2
        cat "$response_file" >&2
        exit 1
    fi
}

curl -fsS "${API_URL%/api/v1}/health/ready" | jq -e '.status == "ok"' >/dev/null
availability="$(curl -fsS http://127.0.0.1:8000/models/availability)"
jq -e '.generation_available == false and .operating_mode == "no-ai" and all(.models[]; .configured == false)' \
    <<<"$availability" >/dev/null

register_payload="$(jq -nc --arg email "$email" --arg password "$password" \
    '{username:"No AI Smoke",email:$email,password:$password}')"
assert_code 200 "$(request_code '' POST '/auth/register' "$register_payload")" "registration"
token="$(jq -er '.token' "$response_file")"

assert_code 200 "$(request_code "$token" GET '/analysis/catalog')" "catalog"
jq -e 'length > 0' "$response_file" >/dev/null
assert_code 200 "$(request_code "$token" GET '/analysis/benchmarks')" "benchmarks"
assert_code 200 "$(request_code "$token" GET '/analysis/history')" "history"
assert_code 200 "$(request_code "$token" GET '/user/settings')" "settings"
assert_code 200 "$(request_code "$token" GET '/analysis/models')" "model availability"
jq -e '.generation_available == false and .operating_mode == "no-ai"' "$response_file" >/dev/null

generation_payload="$(jq -nc --arg request_id "$request_id" '{
    request_id:$request_id,
    model_type:"qwen_local",
    employee:{
        fio:"Тестовый профиль без AI",
        position:"Главный специалист",
        department:"Тестовое ведомство",
        career_goal:"Проверка режима без нейросети",
        learning_history:[]
    }
}')"
assert_code 503 "$(request_code "$token" POST '/analysis/generate-trajectory' "$generation_payload")" "generation without model"
jq -e '.code == "MODEL_UNAVAILABLE"' "$response_file" >/dev/null

assert_code 200 "$(request_code "$token" GET '/analysis/history')" "history after rejected generation"
jq -e --arg request_id "$request_id" 'all(.[]; .id != $request_id)' "$response_file" >/dev/null

if docker ps \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter 'label=com.docker.compose.service=qwen-local' \
    --format '{{.ID}}' | grep -q .; then
    echo "ERROR: qwen-local is running in no-AI mode." >&2
    exit 1
fi

echo "No-AI runtime smoke passed: platform ready, non-AI features available, generation rejected without queueing."
