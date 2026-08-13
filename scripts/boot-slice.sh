#!/usr/bin/env bash
# Boot the vertical-slice demo stack with the fake provider - no API keys needed.
#
#   API  :4100   FAKE_PROVIDER=1   persistent data/live-demo.db (scripted queue)
#   web  :3000   pointed at the API
#
# The scripted FakeProvider queue drives the flow deterministically:
# brief → script (2/5) → retake → revised script (4/5) - so the regenerate
# loop and approve both work out of the box.
#
# Overrides: API_PORT, WEB_PORT, API_DB
#   API_PORT=4200 WEB_PORT=3100 API_DB=slate_demo bash scripts/boot-slice.sh
#
# Stop: re-run the script - it frees stale listeners (the printed pids are
# subshell pids and may not kill the real servers on Windows).
# Windows + git-bash assumed (netstat -ano / taskkill).
set -euo pipefail

API_PORT="${API_PORT:-4100}"
WEB_PORT="${WEB_PORT:-3000}"
API_DB="${API_DB:-slate_demo}"
API_URL="http://localhost:${API_PORT}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

free_port() {
  local port="$1"
  local pid
  pid="$(netstat -ano 2>/dev/null | grep "LISTENING" | grep -E "[:.]${port} " | awk '{print $NF}' | head -1 || true)"
  if [ -n "${pid:-}" ]; then
    # Intended for THIS demo's stale listeners - on a shared machine, double-check
    # the port before letting the script free it.
    echo "  freeing :${port} (stale pid ${pid})"
    taskkill //PID "$pid" //F >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
  fi
}

echo "freeing stale listeners"
free_port "$API_PORT"
free_port "$WEB_PORT"

# Demo film assets: the landing's runner imagery, served by the API's
# /demo-media route so rendered films use REAL media (idempotent).
"$ROOT/scripts/sync-demo-media.sh"

echo "booting API on :${API_PORT} (FAKE_PROVIDER=1, db ${API_DB})"
(
  cd "$ROOT/apps/api"
  # Task 10: the API boots PostgresSaver on DATABASE_URL. The demo DB is a
  # named database on the compose Postgres (created on demand by index.ts).
  FAKE_PROVIDER=1 DATABASE_URL="postgres://slate:slate@localhost:5432/${API_DB}" PORT="$API_PORT" pnpm start
) > /tmp/slate-api.log 2>&1 &
API_PID=$!

echo "booting web on :${WEB_PORT} (→ ${API_URL})"
(
  cd "$ROOT/apps/web"
  NEXT_PUBLIC_API_URL="$API_URL" npx next dev -p "$WEB_PORT"
) > /tmp/slate-web.log 2>&1 &
WEB_PID=$!

API_UP=0
for _ in $(seq 1 30); do
  if curl -sf -m 2 "$API_URL/api/v1/health" >/dev/null 2>&1; then echo " - up"; API_UP=1; break; fi
  echo -n "."
  sleep 1
done
if [ "$API_UP" != "1" ]; then
  echo
  echo "API failed to start - see /tmp/slate-api.log" >&2
  exit 1
fi

echo -n "waiting for web"
WEB_UP=0
for _ in $(seq 1 60); do
  if curl -sf -m 2 "http://localhost:${WEB_PORT}" >/dev/null 2>&1; then echo " - up"; WEB_UP=1; break; fi
  echo -n "."
  sleep 1
done
if [ "$WEB_UP" != "1" ]; then
  echo
  echo "web failed to start - see /tmp/slate-web.log" >&2
  exit 1
fi

echo
echo "slice is live:"
echo "  web   http://localhost:${WEB_PORT}"
echo "  api   ${API_URL}  (FAKE_PROVIDER=1 - scripted queue: brief → script → retake → revised script)"
echo "  logs  /tmp/slate-api.log  /tmp/slate-web.log"
echo "  stop  re-run the script (it frees stale listeners)"
