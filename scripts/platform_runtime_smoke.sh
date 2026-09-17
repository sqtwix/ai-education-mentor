#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${API_URL:-http://127.0.0.1:5050/api/v1}"
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "ERROR: Docker Compose is required." >&2
  exit 1
fi
SMOKE_EMAIL="codex-platform-smoke-20260824@example.test"
SMOKE_PASSWORD="RuntimeSmoke-2026"
REQUEST_ID="platform-smoke-idempotency-20260824"
UNAVAILABLE_FILE=""

cleanup() {
  cd "$PROJECT_DIR"
  "${COMPOSE[@]}" exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DELETE FROM users WHERE email = '\''codex-platform-smoke-20260824@example.test'\'';"' \
    >/dev/null
  if [ -n "$UNAVAILABLE_FILE" ]; then
    rm -f "$UNAVAILABLE_FILE"
  fi
}
trap cleanup EXIT

cleanup

register_body="$(curl -fsS -X POST "$API_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"Platform Smoke\",\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")"
token="$(jq -er '.token' <<<"$register_body")"

cd "$PROJECT_DIR"
"${COMPOSE[@]}" exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "UPDATE users SET role = '\''Admin'\'' WHERE email = '\''codex-platform-smoke-20260824@example.test'\'';"' \
  >/dev/null
login_body="$(curl -fsS -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")"
token="$(jq -er '.token' <<<"$login_body")"
metrics_body="$(curl -fsS "$API_URL/operations/metrics" -H "Authorization: Bearer $token")"
jq -e '.queue.active >= 0 and .processing.total_attempts >= 0 and (.correlation_id | length > 0)' \
  >/dev/null <<<"$metrics_body"

curl -fsS -o /dev/null "$API_URL/analysis/benchmarks" -H "Authorization: Bearer $token"
benchmark_cache_header="$(curl -fsS -D - -o /dev/null "$API_URL/analysis/benchmarks" \
  -H "Authorization: Bearer $token" \
  | tr -d '\r' \
  | awk -F': ' 'tolower($1) == "x-benchmark-cache" { print $2 }')"
test "$benchmark_cache_header" = "HIT"

configured_model="$(curl -fsS http://127.0.0.1:8000/models/availability \
  | jq -r '[.models[] | select(.configured == true) | .id][0] // empty')"

payload="$(jq -cn --arg request_id "$REQUEST_ID" --arg model_type "${configured_model:-deepseek}" '{
  request_id: $request_id,
  model_type: $model_type,
  employee: {
    fio: "Runtime Smoke",
    position: "Главный специалист",
    department: "Тестовое ведомство",
    experience_years: 3,
    career_goal: "Проверка идемпотентности",
    learning_history: []
  }
}')"

idempotency_result="skipped: no configured model"
if [ -n "$configured_model" ]; then
  first_response="$(curl -fsS -X POST "$API_URL/analysis/generate-trajectory" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d "$payload")"
  second_response="$(curl -fsS -X POST "$API_URL/analysis/generate-trajectory" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d "$payload")"

  test "$(jq -r '.task_id' <<<"$first_response")" = "$REQUEST_ID"
  test "$(jq -r '.task_id' <<<"$second_response")" = "$REQUEST_ID"
  test "$(jq -r '.deduplicated' <<<"$second_response")" = "true"
  idempotency_result="passed with $configured_model"
else
  UNAVAILABLE_FILE="$(mktemp)"
  unavailable_status="$(curl -sS -o "$UNAVAILABLE_FILE" -w '%{http_code}' \
    -X POST "$API_URL/analysis/generate-trajectory" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d "$payload")"
  test "$unavailable_status" = "503"
  jq -e '.code == "MODEL_UNAVAILABLE"' "$UNAVAILABLE_FILE" >/dev/null
  rm -f "$UNAVAILABLE_FILE"
  UNAVAILABLE_FILE=""
fi

rate_limit_status=""
# The analysis policy allows six requests per user/minute. Seven additional
# malformed requests deterministically reach 429 in both configured-model and
# no-AI branches, regardless of whether the branch used one or two requests.
for _ in 1 2 3 4 5 6 7; do
  rate_limit_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API_URL/analysis/generate-trajectory" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d '{}')"
done
test "$rate_limit_status" = "429"

echo "Platform runtime smoke пройден: метрики доступны администратору; benchmark-кеш вернул HIT; idempotency=$idempotency_result; лимит analysis вернул 429."
