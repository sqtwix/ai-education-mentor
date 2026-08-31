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
suffix="$(od -An -N 8 -tx1 /dev/urandom | tr -d ' \n')"
email="iot-runtime-$suffix@example.test"
password="Runtime-IOT-$suffix!"
request_id="iot-runtime-$suffix"
work_dir="$(mktemp -d)"

cleanup() {
  cd "$PROJECT_DIR"
  "${COMPOSE[@]}" exec -T postgres sh -lc \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -c \"DELETE FROM analysis_reports WHERE id = '$request_id'; DELETE FROM users WHERE email = '$email';\"" \
    >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

register_body="$(curl -fsS -X POST "$API_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"IOT Runtime\",\"email\":\"$email\",\"password\":\"$password\"}")"
token="$(jq -er '.token' <<<"$register_body")"
catalog="$(curl -fsS "$API_URL/analysis/catalog" -H "Authorization: Bearer $token")"
course_name="$(jq -er '.[0].name' <<<"$catalog")"

payload="$(jq -cn \
  --arg request_id "$request_id" \
  --arg course "$course_name" \
  '{
    request_id: $request_id,
    model_type: "local_llm",
    employee: {
      fio: "Тестовый профиль runtime",
      position: "Главный специалист",
      department: "Тестовое ведомство",
      experience_years: 3,
      career_goal: $course,
      learning_history: [{course_name: "Уже пройденная тестовая программа", course_type: "ЭК", status: "Пройден"}]
    }
  }')"

curl -fsS -X POST "$API_URL/analysis/generate-trajectory" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d "$payload" \
  | jq -e --arg request_id "$request_id" '.task_id == $request_id' >/dev/null

observed_live_stage=false
terminal_body=""
for _ in $(seq 1 240); do
  status_body="$(curl -fsS "$API_URL/analysis/status/$request_id" -H "Authorization: Bearer $token")"
  status="$(jq -r '.status' <<<"$status_body")"
  stage="$(jq -r '.progress_stage // ""' <<<"$status_body")"
  if [ "$status" = "Processing" ] && [ -n "$stage" ] && [ "$stage" != "unknown" ]; then
    observed_live_stage=true
  fi
  if [ "$status" = "Completed" ] || [ "$status" = "CompletedWithLimitations" ] || [ "$status" = "Failed" ]; then
    terminal_body="$status_body"
    break
  fi
  sleep 1
done

test -n "$terminal_body"
terminal_status="$(jq -r '.status' <<<"$terminal_body")"
if [ "$terminal_status" = "Failed" ]; then
  jq -r '.error' <<<"$terminal_body" >&2
  exit 1
fi
test "$observed_live_stage" = "true"

jq -e '
  .result.trajectory.competency_radar == [] and
  ([.result.trajectory.stages[].courses[].course_name] | index("Уже пройденная тестовая программа") | not)
' <<<"$terminal_body" >/dev/null

jq -e --argjson catalog "$catalog" '
  ($catalog | map(.name)) as $official_names |
  [.result.trajectory.stages[].courses[].course_name] |
  all(. as $name | $official_names | index($name) != null)
' <<<"$terminal_body" >/dev/null

echo "IOT runtime smoke пройден: terminal=$terminal_status, live_progress=true, catalog_grounding=true, completed_course_excluded=true."
