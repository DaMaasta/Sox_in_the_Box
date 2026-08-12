#!/bin/sh
set -eu

BACKUP_ROOT=/mnt/data/backups/kistle-postgres
RETENTION_DAYS=30

if ! mountpoint -q /mnt/data; then
  echo "$(date -u +%FT%TZ) backup aborted: /mnt/data is not mounted" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_ROOT"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$BACKUP_ROOT/.webapp-$timestamp.dump.tmp"
target="$BACKUP_ROOT/webapp-$timestamp.dump"

cleanup() {
  if [ -f "$temporary" ]; then
    rm -f "$temporary"
  fi
}
trap cleanup EXIT HUP INT TERM

docker exec postgres pg_dump -U admin -d webapp -Fc > "$temporary"
if [ ! -s "$temporary" ]; then
  echo "$(date -u +%FT%TZ) backup failed: dump is empty" >&2
  exit 1
fi

mv "$temporary" "$target"
chmod 600 "$target"
find "$BACKUP_ROOT" -type f -name 'webapp-*.dump' -mtime "+$RETENTION_DAYS" -delete

echo "$(date -u +%FT%TZ) backup created: $target ($(du -h "$target" | cut -f1))"
