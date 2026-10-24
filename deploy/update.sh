#!/usr/bin/env bash
# Publishes the latest code from GitHub: pulls both repositories, backs up
# the database, rebuilds, applies migrations and restarts the containers.
#   ./update.sh          website + API
#   ./update.sh web      website only (interface changes, faster)
# From the Mac:  ssh dvg /opt/dvg/BE-DVG/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")"
dc() { docker compose --env-file .env.prod -f compose.prod.yaml "$@"; }
only=${1:-all}

echo "== Lấy code mới"
git -C /opt/dvg/FE-DVG pull --ff-only
git -C /opt/dvg/BE-DVG pull --ff-only

if [ "$only" = web ]; then
  echo "== Build website"
  dc build web
  dc up -d web
else
  echo "== Sao lưu database"
  ./backup.sh
  echo "== Build"
  dc build api web migrate
  echo "== Cập nhật cấu trúc database"
  dc run --rm migrate
  dc up -d
fi

docker image prune -f >/dev/null
dc ps
echo "== Xong: $(date '+%H:%M %d/%m/%Y')"
