#!/usr/bin/env bash
# Boot the stack in LIVE auth mode (real Clerk) - enforced JWT verification,
# multi-user isolation, sign-up/sign-in via Clerk's hosted pages.
#
#   web  :3001   Clerk sign-in/up, bearer bridge to the API
#   api  :4101   CLERK_SECRET_KEY present -> enforced mode (owner-scoped routes)
#
# Requires a root .env with (see .env.example):
#   CLERK_SECRET_KEY=sk_test_...
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
#   DATABASE_URL=postgres://...            (defaults to compose slate-pg / slate_live)
#   NVIDIA_API_KEY=...                     (optional: unset -> FAKE_PROVIDER=1 for content)
#
# Why a separate script: boot-slice.sh is the FAKE_PROVIDER demo (no keys,
# ports 4100/3000). This one keeps the demo untouched and never fights its
# dev servers. STUB_AUTH is never set here (test-only).
set -euo pipefail

API_PORT="${API_PORT:-4101}"
WEB_PORT="${WEB_PORT:-3001}"
API_URL="http://localhost:${API_PORT}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
  echo "loaded $ROOT/.env"
else
  echo "ERROR: no $ROOT/.env - create it with your Clerk keys (see .env.example)." >&2
  exit 1
fi

[ -n "${CLERK_SECRET_KEY:-}" ] || { echo "ERROR: CLERK_SECRET_KEY missing in .env" >&2; exit 1; }
[ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ] || { echo "ERROR: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY missing in .env" >&2; exit 1; }
export DATABASE_URL="${DATABASE_URL:-postgres://slate:slate@localhost:5432/slate_live}"

if [ -n "${NVIDIA_API_KEY:-}" ]; then
  echo "provider: NVIDIA (NVIDIA_API_KEY present)"
  unset FAKE_PROVIDER || true
else
  echo "provider: FAKE_PROVIDER=1 (no NVIDIA_API_KEY - auth is still real/enforced)"
  export FAKE_PROVIDER=1
fi

free_port() {
  local port="$1" pid
  pid="$(netstat -ano 2>/dev/null | grep "LISTENING" | grep -E "[:.]${port} " | awk '{print $NF}' | head -1 || true)"
  if [ -n "${pid:-}" ]; then
    echo "  freeing :${port} (stale pid ${pid})"
    taskkill //PID "$pid" //F >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
  fi
}

echo "freeing stale listeners"
free_port "$API_PORT"
free_port "$WEB_PORT"

echo "booting API on :${API_PORT} (enforced auth, db ${DATABASE_URL##*/})"
(
  cd "$ROOT/apps/api"
  PORT="$API_PORT" pnpm start
) > /tmp/slate-live-api.log 2>&1 &
API_PID=$!

echo "booting web on :${WEB_PORT} (Clerk provider active)"
(
  cd "$ROOT/apps/web"
  NEXT_PUBLIC_API_URL="$API_URL" npx next dev -p "$WEB_PORT"
) > /tmp/slate-live-web.log 2>&1 &
WEB_PID=$!

API_UP=0
for _ in $(seq 1 30); do
  if curl -sf -m 2 "$API_URL/api/v1/health" >/dev/null 2>&1; then echo " - up"; API_UP=1; break; fi
  echo -n "."
  sleep 1
done
if [ "$API_UP" != "1" ]; then
  echo
  echo "API failed to start - see /tmp/slate-live-api.log" >&2
  tail -15 /tmp/slate-live-api.log >&2 || true
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
  echo "web failed to start - see /tmp/slate-live-web.log" >&2
  tail -15 /tmp/slate-live-web.log >&2 || true
  exit 1
fi

echo
echo "live stack is up (real Clerk auth):"
echo "  web  http://localhost:${WEB_PORT}"
echo "  api  ${API_URL}  (enforced mode - every /api/v1 route requires a Clerk JWT)"
echo "  logs /tmp/slate-live-api.log  /tmp/slate-live-web.log"
echo "  stop re-run the script (it frees stale listeners)"
