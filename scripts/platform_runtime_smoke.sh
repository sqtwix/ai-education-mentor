#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${API_URL:-http://127.0.0.1:5050/api/v1}"
SMOKE_EMAIL="codex-platform-smoke-20260824@example.test"
SMOKE_PASSWORD="RuntimeSmoke-2026"
REQUEST_ID="platform-smoke-idempotency-20260824"

cleanup() {
  cd "$PROJECT_DIR"
  docker-compose exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DELETE FROM users WHERE email = '\''codex-platform-smoke-20260824@example.test'\'';"' \
    >/dev/null
}
trap cleanup EXIT

cleanup

register_body="$(curl -fsS -X POST "$API_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"Platform Smoke\",\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")"
token="$(jq -er '.token' <<<"$register_body")"

cd "$PROJECT_DIR"
docker-compose exec -T postgres sh -lc \
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

payload="$(jq -cn --arg request_id "$REQUEST_ID" '{
  request_id: $request_id,
  model_type: "deepseek",
  employee: {
    fio: "Runtime Smoke",
    position: "Главный специалист",
    department: "Тестовое ведомство",
    experience_years: 3,
    career_goal: "Проверка идемпотентности",
    learning_history: []
  }
}')"

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

rate_limit_status=""
for _ in 1 2 3 4 5; do
  rate_limit_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API_URL/analysis/generate-trajectory" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d '{}')"
done
test "$rate_limit_status" = "429"

echo "Platform runtime smoke пройден: метрики доступны администратору; benchmark-кеш вернул HIT; повторный request_id дедуплицирован; лимит analysis вернул 429."
