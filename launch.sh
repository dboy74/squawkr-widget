#!/usr/bin/env bash
# Toggle the Squawkr widget panel on Omarchy / Hyprland — standard toolbar-panel behaviour.
# Clicking the bar icon runs this: if the panel is already open it CLOSES it; otherwise it opens
# a floating chromium --app window. The app uses ES modules + fetch, so it's served over http
# (file:// blocks modules) by serve.py, which also gives the panel /__open and /__close routes.
# APP_DIR/SERVE resolve to the installed copies (~/.local/share/squawkr-widget/…) or, when run
# from the repo, the siblings here — so it works both installed and in-tree.
set -euo pipefail

if [ -n "${SQUAWKR_APP_DIR:-}" ]; then APP_DIR="$SQUAWKR_APP_DIR"
elif [ -d "$HOME/.local/share/squawkr-widget/app" ]; then APP_DIR="$HOME/.local/share/squawkr-widget/app"
else APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/app" && pwd)"; fi

if   [ -f "$HOME/.local/share/squawkr-widget/serve.py" ]; then SERVE="$HOME/.local/share/squawkr-widget/serve.py"
else SERVE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/serve.py"; fi

PORT="${SQUAWKR_WIDGET_PORT:-8770}"
URL="http://127.0.0.1:${PORT}/index.html"
WINCLASS="chrome-127.0.0.1__index.html-Default"

# Toggle: if the panel window is already open, close it and stop here (don't stack a second one).
if hyprctl -j clients 2>/dev/null | grep -q "\"${WINCLASS}\""; then
  python3 - "$PORT" <<'PY'
import os, sys, signal
flag = ("--app=http://127.0.0.1:%s/index.html" % sys.argv[1]).encode()
me = os.getpid()
for pid in os.listdir("/proc"):
    if not pid.isdigit() or int(pid) == me:
        continue
    try:
        cl = open("/proc/%s/cmdline" % pid, "rb").read()
    except OSError:
        continue
    if flag in cl:
        try: os.kill(int(pid), signal.SIGTERM)
        except OSError: pass
PY
  exit 0
fi

# Not open → ensure the server, then open the panel.
if ! curl -sf -o /dev/null "$URL" 2>/dev/null; then
  setsid python3 "$SERVE" "$APP_DIR" >/dev/null 2>&1 &
  for _ in $(seq 1 40); do curl -sf -o /dev/null "$URL" && break; sleep 0.15; done
fi

# chromium ignores --class for --app under Wayland (it derives the app_id from the URL); the
# Hyprland rule matches that derived class. --no-first-run avoids a fresh-profile stall.
exec setsid uwsm-app -- chromium --app="$URL" \
  --user-data-dir="${XDG_DATA_HOME:-$HOME/.local/share}/squawkr-widget/chrome" \
  --no-first-run --no-default-browser-check >/dev/null 2>&1
