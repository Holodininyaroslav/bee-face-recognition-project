#!/usr/bin/env bash
set -euo pipefail

ROOT="$HOME/codex_flappy/flappy"
RUNTIME="/tmp/flappy_hummingbird_inspector"
PORT="${FLAPPY_INSPECTOR_PORT:-8099}"

mkdir -p "$RUNTIME"

if [ -f "$RUNTIME/inspector.pid" ]; then
  pid="$(cat "$RUNTIME/inspector.pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.5
  fi
fi

pkill -f "flappy_inspector.py" 2>/dev/null || true

cd "$ROOT"
. .venv/bin/activate
setsid nohup env FLAPPY_INSPECTOR_PORT="$PORT" python flappy_inspector.py >"$RUNTIME/inspector.log" 2>&1 </dev/null &
echo $! > "$RUNTIME/inspector.pid"

for _ in $(seq 1 40); do
  if grep -q "FLAPPY_INSPECTOR_READY" "$RUNTIME/inspector.log" 2>/dev/null; then
    echo "FLAPPY_INSPECTOR_READY http://127.0.0.1:$PORT/"
    tail -n 20 "$RUNTIME/inspector.log"
    exit 0
  fi
  sleep 0.25
done

cat "$RUNTIME/inspector.log" 2>/dev/null || true
exit 1
