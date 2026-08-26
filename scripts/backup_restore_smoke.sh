#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif docker-compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose не найден." >&2
  exit 1
fi

SMOKE_SUFFIX="$(date +%Y%m%d%H%M%S)_$$"
SMOKE_DATABASE="iot_restore_smoke_${SMOKE_SUFFIX}"
TEMP_DIR="$(mktemp -d)"
BACKUP_FILE="$TEMP_DIR/postgres.dump"

cleanup() {
  "${COMPOSE[@]}" exec -T postgres sh -lc 'dropdb --if-exists -U "$POSTGRES_USER" "$1"' sh "$SMOKE_DATABASE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Создаём проверочный backup работающей базы..."
"${COMPOSE[@]}" exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "Backup пуст." >&2
  exit 1
fi

SOURCE_COUNTS="$("${COMPOSE[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT (SELECT COUNT(*) FROM users) || '\''|'\'' || (SELECT COUNT(*) FROM analysis_reports) || '\''|'\'' || (SELECT COUNT(*) FROM analysis_reports WHERE result_json IS NOT NULL);"' | tr -d '\r')"

echo "Восстанавливаем backup в изолированную временную базу $SMOKE_DATABASE..."
"${COMPOSE[@]}" exec -T postgres sh -lc 'createdb -U "$POSTGRES_USER" "$1"' sh "$SMOKE_DATABASE"

"${COMPOSE[@]}" exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges' sh "$SMOKE_DATABASE" < "$BACKUP_FILE"

RESTORED_COUNTS="$("${COMPOSE[@]}" exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$1" -Atc "SELECT (SELECT COUNT(*) FROM users) || '\''|'\'' || (SELECT COUNT(*) FROM analysis_reports) || '\''|'\'' || (SELECT COUNT(*) FROM analysis_reports WHERE result_json IS NOT NULL);"' sh "$SMOKE_DATABASE" | tr -d '\r')"

if [[ "$SOURCE_COUNTS" != "$RESTORED_COUNTS" ]]; then
  echo "Проверка восстановления не пройдена: source=$SOURCE_COUNTS restored=$RESTORED_COUNTS" >&2
  exit 1
fi

echo "Backup/restore smoke пройден: users|reports|reports_with_result=$RESTORED_COUNTS"
