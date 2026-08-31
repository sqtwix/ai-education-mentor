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
USER_COUNT="${USER_COUNT:-3}"
POLL_TIMEOUT_SECONDS="${POLL_TIMEOUT_SECONDS:-600}"
RESULT_FILE="${RESULT_FILE:-}"
suffix="$(od -An -N 8 -tx1 /dev/urandom | tr -d ' \n')"
work_dir="$(mktemp -d)"
started_at="$(date +%s)"

declare -a emails tokens task_ids terminal_bodies submitted_at completed_at

cleanup() {
  cd "$PROJECT_DIR"
  for index in $(seq 0 $((USER_COUNT - 1))); do
    if [ -n "${task_ids[$index]:-}" ]; then
      "${COMPOSE[@]}" exec -T postgres sh -lc \
        "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -c \"DELETE FROM analysis_reports WHERE id = '${task_ids[$index]}';\"" \
        >/dev/null 2>&1 || true
    fi
    if [ -n "${emails[$index]:-}" ]; then
      "${COMPOSE[@]}" exec -T postgres sh -lc \
        "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -c \"DELETE FROM users WHERE email = '${emails[$index]}';\"" \
        >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$work_dir"
}
trap cleanup EXIT

if [ "$USER_COUNT" -lt 2 ] || [ "$USER_COUNT" -gt 5 ]; then
  echo "USER_COUNT должен быть от 2 до 5." >&2
  exit 2
fi

for index in $(seq 0 $((USER_COUNT - 1))); do
  emails[$index]="iot-queue-$suffix-$index@example.test"
  task_ids[$index]="iot-queue-$suffix-$index"
  password="Runtime-Queue-$suffix-$index!"
  register_body="$(curl -fsS -X POST "$API_URL/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"IOT Queue $index\",\"email\":\"${emails[$index]}\",\"password\":\"$password\"}")"
  tokens[$index]="$(jq -er '.token' <<<"$register_body")"
done

catalog="$(curl -fsS "$API_URL/analysis/catalog" -H "Authorization: Bearer ${tokens[0]}")"
completed_course="$(jq -er '.[0].name' <<<"$catalog")"

for index in $(seq 0 $((USER_COUNT - 1))); do
  career_goal="$(jq -er --argjson index "$((index + 30))" '.[$index].name' <<<"$catalog")"
  payload="$(jq -cn \
    --arg request_id "${task_ids[$index]}" \
    --arg fio "Пользователь очереди $((index + 1))" \
    --arg goal "$career_goal" \
    --arg completed "$completed_course" '
      {
        request_id: $request_id,
        model_type: "qwen_local",
        employee: {
          fio: $fio,
          position: "Главный специалист",
          department: "Тестовое ведомство очереди",
          experience_years: 5,
          career_goal: $goal,
          learning_history: [{course_name: $completed, course_type: "ЭК", status: "Пройден"}]
        }
      }
    ')"
  submitted_at[$index]="$(date +%s)"
  curl -fsS -X POST "$API_URL/analysis/generate-trajectory" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${tokens[$index]}" \
    -d "$payload" >"$work_dir/submit-$index.json" &
done
wait

for index in $(seq 0 $((USER_COUNT - 1))); do
  jq -e --arg task_id "${task_ids[$index]}" '.task_id == $task_id' "$work_dir/submit-$index.json" >/dev/null
done

isolation_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  "$API_URL/analysis/status/${task_ids[1]}" \
  -H "Authorization: Bearer ${tokens[0]}")"
test "$isolation_code" = "404"

remaining="$USER_COUNT"
for _ in $(seq 1 "$POLL_TIMEOUT_SECONDS"); do
  for index in $(seq 0 $((USER_COUNT - 1))); do
    if [ -n "${terminal_bodies[$index]:-}" ]; then
      continue
    fi
    body="$(curl -fsS "$API_URL/analysis/status/${task_ids[$index]}" -H "Authorization: Bearer ${tokens[$index]}")"
    status="$(jq -r '.status' <<<"$body")"
    if [ "$status" = "Completed" ] || [ "$status" = "CompletedWithLimitations" ] || [ "$status" = "Failed" ]; then
      terminal_bodies[$index]="$body"
      completed_at[$index]="$(date +%s)"
      remaining=$((remaining - 1))
    fi
  done
  if [ "$remaining" -eq 0 ]; then
    break
  fi
  sleep 1
done
test "$remaining" -eq 0

status_array='[]'
duration_array='[]'
for index in $(seq 0 $((USER_COUNT - 1))); do
  body="${terminal_bodies[$index]}"
  status="$(jq -r '.status' <<<"$body")"
  test "$status" != "Failed"
  jq -e --arg completed "$completed_course" --argjson catalog "$catalog" '
    ($catalog | map(.name)) as $official_names |
    [.result.trajectory.stages[].courses[].course_name] as $recommended |
    ($recommended | index($completed) | not) and
    ($recommended | all(. as $name | $official_names | index($name) != null)) and
    .result.trajectory.competency_radar == []
  ' <<<"$body" >/dev/null
  duration="$((completed_at[$index] - submitted_at[$index]))"
  status_array="$(jq -cn --argjson current "$status_array" --arg status "$status" '$current + [$status]')"
  duration_array="$(jq -cn --argjson current "$duration_array" --argjson duration "$duration" '$current + [$duration]')"
done

elapsed_seconds="$(( $(date +%s) - started_at ))"
result_json="$(jq -cn \
  --argjson users "$USER_COUNT" \
  --argjson elapsed_seconds "$elapsed_seconds" \
  --argjson statuses "$status_array" \
  --argjson completion_seconds "$duration_array" '
    {
      test: "iot_multi_user_queue",
      users: $users,
      elapsed_seconds: $elapsed_seconds,
      statuses: $statuses,
      completion_seconds: $completion_seconds,
      cross_user_task_isolation: true,
      catalog_grounding: true,
      completed_course_excluded: true,
      unsupported_competency_scores_absent: true
    }
  ')"
if [ -n "$RESULT_FILE" ]; then
  printf '%s\n' "$result_json" >"$RESULT_FILE"
fi
printf '%s\n' "$result_json"
