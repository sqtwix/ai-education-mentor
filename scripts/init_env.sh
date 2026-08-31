#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
ENV_TEMPLATE="$REPO_DIR/env_example.txt"

if [ ! -f "$ENV_TEMPLATE" ]; then
    echo "ERROR: env_example.txt was not found." >&2
    exit 1
fi

random_hex() {
    local byte_count="$1"
    od -An -N "$byte_count" -tx1 /dev/urandom | tr -d ' \n'
}

frontend_port="${FRONTEND_PORT:-80}"
if ! [[ "$frontend_port" =~ ^[0-9]+$ ]] || [ "$frontend_port" -lt 1 ] || [ "$frontend_port" -gt 65535 ]; then
    echo "ERROR: FRONTEND_PORT must be an integer from 1 to 65535." >&2
    exit 1
fi

if [ -f "$ENV_FILE" ]; then
    if sed 's/\r$//' "$ENV_FILE" | grep -Eq '^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=|^[A-Za-z_][A-Za-z0-9_]*[[:space:]]+='; then
        echo "ERROR: .env keys must not contain leading or trailing whitespace around the key name or '='." >&2
        exit 1
    fi

    duplicate_keys="$(sed 's/\r$//' "$ENV_FILE" \
        | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' \
        | sort | uniq -d)"
    if [ -n "$duplicate_keys" ]; then
        echo "ERROR: .env contains duplicate keys; keep one value for each:" >&2
        printf '%s\n' "$duplicate_keys" >&2
        exit 1
    fi

    # Keep every existing value intact. Only append template keys introduced by
    # newer releases; this makes repeated deploys idempotent and preserves
    # installation-specific secrets.
    if [ -s "$ENV_FILE" ] && [ -n "$(tail -c 1 "$ENV_FILE")" ]; then
        printf '\n' >> "$ENV_FILE"
    fi

    while IFS= read -r template_line || [ -n "$template_line" ]; do
        template_line="${template_line%$'\r'}"
        [[ "$template_line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
        template_key="${template_line%%=*}"
        if ! grep -q "^${template_key}=" "$ENV_FILE"; then
            printf '%s\n' "$template_line" >> "$ENV_FILE"
            echo "--> Added missing ${template_key} to .env (template default)."
        fi
    done < "$ENV_TEMPLATE"

    chmod 600 "$ENV_FILE"
    echo "--> Existing .env validated and updated without replacing values."
    exit 0
fi

db_password=""
jwt_secret=""
credentials_source="generated"

# If the project is already running, preserve the credentials stored in the
# API container. This prevents an existing PostgreSQL volume from becoming
# inaccessible when a previously missing .env file is restored.
if command -v docker >/dev/null 2>&1; then
    project_name="${COMPOSE_PROJECT_NAME:-$(basename "$REPO_DIR")}"
    api_container="$(docker ps \
        --filter "label=com.docker.compose.project=$project_name" \
        --filter "label=com.docker.compose.service=api-core" \
        --format '{{.ID}}' 2>/dev/null | head -n 1 || true)"

    if [ -n "$api_container" ]; then
        runtime_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$api_container" 2>/dev/null || true)"
        runtime_connection="$(printf '%s\n' "$runtime_env" | sed -n 's/^ConnectionStrings__DefaultConnection=//p' | head -n 1)"
        jwt_secret="$(printf '%s\n' "$runtime_env" | sed -n 's/^JwtSettings__Secret=//p' | head -n 1)"

        if [[ "$runtime_connection" == *"Password="* ]]; then
            db_password="${runtime_connection##*Password=}"
            db_password="${db_password%%;*}"
        fi

        if [ -n "$db_password" ] && [ "${#jwt_secret}" -ge 32 ]; then
            credentials_source="running containers"
        else
            db_password=""
            jwt_secret=""
        fi
    fi
fi

if [ -z "$db_password" ]; then
    db_password="$(random_hex 32)"
fi
if [ "${#jwt_secret}" -lt 32 ]; then
    jwt_secret="$(random_hex 48)"
fi

umask 077
temporary_env="$(mktemp "$REPO_DIR/.env.tmp.XXXXXX")"
trap 'rm -f "$temporary_env"' EXIT

awk \
    -v db_password="$db_password" \
    -v jwt_secret="$jwt_secret" \
    -v frontend_port="$frontend_port" '
        /^DB_PASSWORD=/ { print "DB_PASSWORD=" db_password; next }
        /^JWT_SECRET=/ { print "JWT_SECRET=" jwt_secret; next }
        /^FRONTEND_PORT=/ { print "FRONTEND_PORT=" frontend_port; next }
        { print }
    ' "$ENV_TEMPLATE" > "$temporary_env"

chmod 600 "$temporary_env"
mv "$temporary_env" "$ENV_FILE"
trap - EXIT

echo "--> Created .env with restricted permissions (credentials: $credentials_source)."
echo "--> Optional LLM keys and MIN_COHORT_SIZE remain unset until approved values are provided."
