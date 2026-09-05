#!/usr/bin/env bash
set -euo pipefail
umask 077
# Create with: x11vnc -storepasswd ~/.vnc/flappy.pass
PASSWORD_FILE="${MFL_VNC_PASSWORD_FILE:-$HOME/.vnc/flappy.pass}"
if [[ ! -f "$PASSWORD_FILE" || -L "$PASSWORD_FILE" || ! -O "$PASSWORD_FILE" ]] || [[ "$(stat -c %a "$PASSWORD_FILE")" != 600 ]]; then
  echo 'Refusing unauthenticated VNC. Create an owner-only (chmod 600) VNC password file first.' >&2
  exit 1
fi

ROOT="$HOME/codex_flappy/flappy"
RUNTIME="/tmp/flappy_hummingbird"
DISPLAY_ID=":99"
HTTP_PORT="6080"
VNC_PORT="5900"

mkdir -p "$RUNTIME"
if [[ -L "$RUNTIME" || ! -O "$RUNTIME" ]]; then echo 'Unsafe runtime directory' >&2; exit 1; fi
chmod 700 "$RUNTIME"

stop_pid_file() {
  local file="$1"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.5
    fi
    rm -f "$file"
  fi
}

stop_pid_file "$RUNTIME/flappy.pid"
stop_pid_file "$RUNTIME/novnc.pid"
stop_pid_file "$RUNTIME/x11vnc.pid"
stop_pid_file "$RUNTIME/xvfb.pid"

pkill -f "Xvfb $DISPLAY_ID" 2>/dev/null || true
pkill -f "x11vnc .*display $DISPLAY_ID" 2>/dev/null || true
pkill -f "novnc_proxy.*$HTTP_PORT" 2>/dev/null || true

setsid nohup Xvfb "$DISPLAY_ID" -nolisten tcp -screen 0 1280x800x24 >"$RUNTIME/xvfb.log" 2>&1 </dev/null &
echo $! > "$RUNTIME/xvfb.pid"
sleep 1

setsid nohup x11vnc -display "$DISPLAY_ID" -localhost -forever -shared -rfbauth "$PASSWORD_FILE" -quiet -noshm -noxdamage -xkb >"$RUNTIME/x11vnc.log" 2>&1 </dev/null &
echo $! > "$RUNTIME/x11vnc.pid"
sleep 1

setsid nohup websockify --web=/usr/share/novnc "127.0.0.1:$HTTP_PORT" "127.0.0.1:$VNC_PORT" >"$RUNTIME/novnc.log" 2>&1 </dev/null &
echo $! > "$RUNTIME/novnc.pid"
sleep 1

cd "$ROOT"
. .venv/bin/activate
setsid nohup env DISPLAY="$DISPLAY_ID" python run_visual_live_pid.py >"$RUNTIME/flappy.log" 2>&1 </dev/null &
echo $! > "$RUNTIME/flappy.pid"

sleep 2
echo "FLAPPY_NOVNC_READY http://127.0.0.1:$HTTP_PORT/vnc.html?autoconnect=true&resize=scale"
tail -n 20 "$RUNTIME/flappy.log" || true
