#!/usr/bin/env bash
# Publishes the latest code from GitHub: pulls both repositories, then
# rebuilds only what changed (database backup and migrations come with every
# API update).
#   ./update.sh          what changed since the last update (website and/or API)
#   ./update.sh web      website only
#   ./update.sh all      everything, changed or not (e.g. after a failed update)
# From the Mac:  ssh dvg /opt/dvg/BE-DVG/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")"
dc() { docker compose --env-file .env.prod -f compose.prod.yaml "$@"; }
FE=/opt/dvg/FE-DVG
BE=/opt/dvg/BE-DVG

# Files whose change needs the service rebuilt (tests and notes do not).
changed() { git -C "$1" diff --name-only "$2" HEAD -- . ':!test' ':!tests' ':!*.md' | grep -q .; }

main() {
  local only=${1:-auto} fe_from=${2:-} be_from=${3:-}
  if [ -z "$fe_from" ]; then
    echo "== Lấy code mới"
    fe_from=$(git -C "$FE" rev-parse HEAD)
    be_from=$(git -C "$BE" rev-parse HEAD)
    git -C "$FE" pull --ff-only
    git -C "$BE" pull --ff-only
    # This script may itself have changed: run the new version.
    if ! git -C "$BE" diff --quiet "$be_from" HEAD -- deploy/update.sh; then
      exec "$PWD/$(basename "$0")" "$only" "$fe_from" "$be_from"
    fi
  fi

  local web=no api=no
  case "$only" in
    web) web=yes ;;
    all) web=yes api=yes ;;
    *)
      changed "$FE" "$fe_from" && web=yes
      changed "$BE" "$be_from" && api=yes
      ;;
  esac
  if [ $web = no ] && [ $api = no ]; then
    echo "== Không có code mới cần build. (Muốn build lại tất cả: ./update.sh all)"
    return
  fi

  if [ $api = yes ]; then
    echo "== Sao lưu database"
    ./backup.sh
    echo "== Cập nhật cấu trúc database"
    dc build migrate
    dc run --rm migrate
    echo "== Thay nội dung demo còn sót (chỉ trang còn chữ demo)"
    dc run --rm migrate npm run content:real
    echo "== Thêm mã căn vào đường dẫn căn cũ (link cũ tự chuyển sang link mới)"
    dc run --rm migrate npm run units:codes
  fi

  local services=()
  [ $api = yes ] && services+=(api)
  [ $web = yes ] && services+=(web)
  echo "== Build: ${services[*]}"
  dc build "${services[@]}"
  # Every service: also picks up changes to compose.prod.yaml (Caddy, database).
  dc up -d

  docker image prune -f >/dev/null
  dc ps
  echo "== Xong: $(date '+%H:%M %d/%m/%Y')"
}

# One line: bash has read it whole before `git pull` can rewrite this file.
main "$@"; exit
