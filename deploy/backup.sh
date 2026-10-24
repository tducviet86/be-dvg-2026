#!/usr/bin/env bash
# Daily database backup, kept 14 days in deploy/backups (compressed custom
# format). Install with:  crontab -e  →
#   30 2 * * * /opt/dvg/BE-DVG/deploy/backup.sh >> /var/log/dvg-backup.log 2>&1
# Restore into an EMPTY database only (see docs/DEPLOY-VPS.md).
set -euo pipefail
cd "$(dirname "$0")"
stamp=$(date +%F-%H%M)
docker compose --env-file .env.prod -f compose.prod.yaml exec -T db \
  pg_dump -U dvg -d dvg --format=custom --no-owner -f "/backups/dvg-$stamp.dump"
find ./backups -name 'dvg-*.dump' -mtime +14 -delete
echo "$(date -Is) backup dvg-$stamp.dump ok"
