#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:5050}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ai-education-mentor}"

for command_name in curl docker jq od; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "ERROR: $command_name is required." >&2
        exit 1
    fi
done

postgres_container="$(docker ps \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter "label=com.docker.compose.service=postgres" \
    --format '{{.ID}}' | head -n 1)"
if [ -z "$postgres_container" ]; then
    echo "ERROR: PostgreSQL container for project $PROJECT_NAME is not running." >&2
    exit 1
fi

curl -fsS "$API_URL/health" >/dev/null

suffix="$(od -An -N 10 -tx1 /dev/urandom | tr -d ' \n')"
email_a="qa-acl-a-$suffix@example.test"
email_b="qa-acl-b-$suffix@example.test"
password="QaAcl-$suffix-9!"
task_id="qa-acl-$suffix"
work_dir="$(mktemp -d)"
response_file="$work_dir/response.json"

cleanup() {
    docker exec "$postgres_container" psql -U aichecker_user -d aichecker -v ON_ERROR_STOP=1 -c \
        "DELETE FROM analysis_reports WHERE id = '$task_id'; DELETE FROM users WHERE email IN ('$email_a', '$email_b');" \
        >/dev/null 2>&1 || true
    rm -rf "$work_dir"
}
trap cleanup EXIT

register_user() {
    local username="$1"
    local email="$2"
    local payload
    local status
    payload="$(jq -nc --arg username "$username" --arg email "$email" --arg password "$password" \
        '{username:$username,email:$email,password:$password}')"
    status="$(curl -sS -o "$response_file" -w '%{http_code}' \
        -H 'Content-Type: application/json' \
        --data "$payload" \
        "$API_URL/api/v1/auth/register")"
    if [ "$status" != "200" ]; then
        echo "ERROR: registration returned HTTP $status." >&2
        exit 1
    fi
    jq -er '.token | select(length > 20)' "$response_file"
}

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
        exit 1
    fi
}

token_a="$(register_user 'QA ACL Employee A' "$email_a")"
token_b="$(register_user 'QA ACL Employee B' "$email_b")"

docker exec "$postgres_container" psql -U aichecker_user -d aichecker -v ON_ERROR_STOP=1 -c \
    "INSERT INTO analysis_reports (id, user_id, course_name, created_at, status, is_archived, attempt_count, updated_at) SELECT '$task_id', id, 'QA ACL fixture', now(), 'CompletedWithLimitations', false, 0, now() FROM users WHERE email = '$email_a';" \
    >/dev/null

assert_code 401 "$(request_code '' GET "/api/v1/analysis/status/$task_id")" "anonymous status"
assert_code 200 "$(request_code "$token_a" GET "/api/v1/analysis/status/$task_id")" "owner status"
assert_code 404 "$(request_code "$token_b" GET "/api/v1/analysis/status/$task_id")" "foreign status"
assert_code 404 "$(request_code "$token_b" PUT "/api/v1/analysis/rename/$task_id" '{"name":"Foreign rename"}')" "foreign rename"
assert_code 404 "$(request_code "$token_b" PUT "/api/v1/analysis/archive/$task_id")" "foreign archive"
assert_code 404 "$(request_code "$token_b" PUT "/api/v1/analysis/unarchive/$task_id")" "foreign unarchive"
assert_code 403 "$(request_code "$token_b" GET "/api/v1/analysis/users")" "employee registry"

assert_code 200 "$(request_code "$token_b" GET '/api/v1/analysis/history?includeArchived=true')" "foreign history"
if ! jq -e --arg task_id "$task_id" 'all(.[]; .id != $task_id)' "$response_file" >/dev/null; then
    echo "ERROR: foreign history disclosed the owner's report." >&2
    exit 1
fi

assert_code 200 "$(request_code "$token_a" PUT "/api/v1/analysis/rename/$task_id" '{"name":"QA ACL renamed"}')" "owner rename"
assert_code 200 "$(request_code "$token_a" PUT "/api/v1/analysis/archive/$task_id")" "owner archive"
assert_code 200 "$(request_code "$token_a" GET '/api/v1/analysis/history?onlyArchived=true')" "owner archived history"
if ! jq -e --arg task_id "$task_id" 'any(.[]; .id == $task_id and .isArchived == true)' "$response_file" >/dev/null; then
    echo "ERROR: owner archived history does not contain the archived report." >&2
    exit 1
fi
assert_code 200 "$(request_code "$token_a" PUT "/api/v1/analysis/unarchive/$task_id")" "owner unarchive"

echo "ACL smoke: 12/12 checks passed; temporary users and report will be removed."
