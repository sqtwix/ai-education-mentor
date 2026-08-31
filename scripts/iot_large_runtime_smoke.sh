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
PROFILE_COUNT="${PROFILE_COUNT:-15}"
CHECKPOINT_RESTART_AT="${CHECKPOINT_RESTART_AT:-2}"
POLL_TIMEOUT_SECONDS="${POLL_TIMEOUT_SECONDS:-900}"
RESULT_FILE="${RESULT_FILE:-}"

suffix="$(od -An -N 8 -tx1 /dev/urandom | tr -d ' \n')"
email="iot-large-$suffix@example.test"
password="Runtime-IOT-$suffix!"
request_id="iot-large-$suffix"
work_dir="$(mktemp -d)"
fixture="$work_dir/profiles.json"
started_at="$(date +%s)"

on_error() {
  local exit_code=$?
  echo "iot_large_runtime_smoke: ошибка в строке ${BASH_LINENO[0]} (exit=$exit_code)." >&2
  if [ -n "${terminal_body:-}" ]; then
    jq '{status, error, attempt_count, result_summary: (.result | if type == "object" then {total_profiles_processed, quality_status, courses_count: (.courses_analysis | length)} else null end)}' \
      <<<"$terminal_body" >&2 || true
  fi
  exit "$exit_code"
}
trap on_error ERR

cleanup() {
  cd "$PROJECT_DIR"
  "${COMPOSE[@]}" exec -T postgres sh -lc \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -c \"DELETE FROM analysis_reports WHERE id = '$request_id'; DELETE FROM users WHERE email = '$email';\"" \
    >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

if [ "$PROFILE_COUNT" -lt 2 ] || [ "$PROFILE_COUNT" -gt 15 ]; then
  echo "PROFILE_COUNT должен быть от 2 до 15." >&2
  exit 2
fi

register_body="$(curl -fsS -X POST "$API_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"IOT Large Runtime\",\"email\":\"$email\",\"password\":\"$password\"}")"
token="$(jq -er '.token' <<<"$register_body")"
catalog="$(curl -fsS "$API_URL/analysis/catalog" -H "Authorization: Bearer $token")"
completed_course="$(jq -er '.[0].name' <<<"$catalog")"

jq -n \
  --argjson catalog "$catalog" \
  --arg completed "$completed_course" \
  --argjson count "$PROFILE_COUNT" '
    [range(0; $count) as $index |
      {
        fio: ("Нагрузочный профиль " + (($index + 1) | tostring)),
        position: (if $index % 3 == 0 then "Главный специалист" elif $index % 3 == 1 then "Начальник отдела" else "Ведущий специалист" end),
        department: ("Тестовое ведомство " + (($index % 4) + 1 | tostring)),
        experience_years: (($index % 10) + 1),
        career_goal: $catalog[$index + 1].name,
        learning_history: [
          {course_name: $completed, course_type: "ЭК", status: "Пройден"}
        ]
      }
    ]
  ' >"$fixture"

upload_body="$(curl -fsS -X POST "$API_URL/analysis/upload" \
  -H "Authorization: Bearer $token" \
  -F "userResponseFiles=@$fixture;type=application/json" \
  -F 'modelType=local_llm' \
  -F "requestId=$request_id")"
jq -e --arg request_id "$request_id" '.task_id == $request_id' <<<"$upload_body" >/dev/null

observed_processing=false
observed_live_stage=false
restart_triggered=false
restart_trigger_checkpoint=0
max_checkpoint=0
terminal_body=""
stages_file="$work_dir/stages.txt"
: >"$stages_file"

for _ in $(seq 1 "$POLL_TIMEOUT_SECONDS"); do
  status_body="$(curl -fsS "$API_URL/analysis/status/$request_id" -H "Authorization: Bearer $token")"
  status="$(jq -r '.status' <<<"$status_body")"
  stage="$(jq -r '.progress_stage // ""' <<<"$status_body")"
  printf '%s\n' "$status:$stage" >>"$stages_file"

  if [ "$status" = "Processing" ]; then
    observed_processing=true
    if [ -n "$stage" ] && [ "$stage" != "unknown" ]; then
      observed_live_stage=true
    fi
  fi

  checkpoint="$(cd "$PROJECT_DIR" && "${COMPOSE[@]}" exec -T postgres sh -lc \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atqc \"SELECT COALESCE((checkpoint_json->>'NextEmployeeIndex')::int, 0) FROM analysis_reports WHERE id = '$request_id';\"" 2>/dev/null || printf '0')"
  checkpoint="${checkpoint:-0}"
  if [[ "$checkpoint" =~ ^[0-9]+$ ]] && [ "$checkpoint" -gt "$max_checkpoint" ]; then
    max_checkpoint="$checkpoint"
  fi

  if [ "$restart_triggered" = "false" ] && [ "$checkpoint" -ge "$CHECKPOINT_RESTART_AT" ]; then
    restart_triggered=true
    restart_trigger_checkpoint="$checkpoint"
    (cd "$PROJECT_DIR" && "${COMPOSE[@]}" kill -s SIGKILL ai-driver >/dev/null)
    (cd "$PROJECT_DIR" && "${COMPOSE[@]}" up -d ai-driver >/dev/null)
    for _ in $(seq 1 60); do
      if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
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

test "$observed_processing" = "true"
test "$observed_live_stage" = "true"
test "$restart_triggered" = "true"
jq -e --argjson count "$PROFILE_COUNT" '
  .result.total_profiles_processed == $count and
  (.result.courses_analysis | length) == $count and
  all(.result.courses_analysis[]; .competency_radar == [])
' <<<"$terminal_body" >/dev/null

jq -e --argjson catalog "$catalog" '
  ($catalog | map(.name)) as $official_names |
  [.result.courses_analysis[].stages[].courses[].course_name] |
  all(. as $name | $official_names | index($name) != null)
' <<<"$terminal_body" >/dev/null

jq -e --arg completed "$completed_course" '
  [.result.courses_analysis[].stages[].courses[].course_name] |
  index($completed) | not
' <<<"$terminal_body" >/dev/null

attempt_count="$(jq -er '.attempt_count' <<<"$terminal_body")"
test "$attempt_count" -ge 2
checkpoint_after="$(cd "$PROJECT_DIR" && "${COMPOSE[@]}" exec -T postgres sh -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atqc \"SELECT CASE WHEN checkpoint_json IS NULL THEN 'cleared' ELSE 'present' END FROM analysis_reports WHERE id = '$request_id';\"" 2>/dev/null)"
test "$checkpoint_after" = "cleared"

elapsed_seconds="$(( $(date +%s) - started_at ))"
unique_stages="$(sort -u "$stages_file" | jq -Rsc 'split("\n") | map(select(length > 0))')"
result_json="$(jq -cn \
  --arg status "$terminal_status" \
  --argjson profiles "$PROFILE_COUNT" \
  --argjson elapsed_seconds "$elapsed_seconds" \
  --argjson attempt_count "$attempt_count" \
  --argjson restart_trigger_checkpoint "$restart_trigger_checkpoint" \
  --argjson max_checkpoint "$max_checkpoint" \
  --argjson stages "$unique_stages" \
  '{
    test: "iot_large_runtime",
    status: $status,
    profiles: $profiles,
    elapsed_seconds: $elapsed_seconds,
    attempt_count: $attempt_count,
    forced_ai_restart: true,
    restart_trigger_checkpoint: $restart_trigger_checkpoint,
    max_checkpoint_observed: $max_checkpoint,
    checkpoint_cleared_after_completion: true,
    live_progress_observed: true,
    catalog_grounding: true,
    completed_course_excluded: true,
    unsupported_competency_scores_absent: true,
    observed_states: $stages
  }')"

if [ -n "$RESULT_FILE" ]; then
  printf '%s\n' "$result_json" >"$RESULT_FILE"
fi
printf '%s\n' "$result_json"
