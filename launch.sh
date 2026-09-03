#!/usr/bin/env bash
# Toggle the Squawkr widget panel on Omarchy / Hyprland — fast, like a native scratchpad.
#
# The panel is a chromium --app window served over http by serve.py (file:// blocks ES modules).
# To make toggling INSTANT (native plugins pop in/out immediately; relaunching chromium each click
# took seconds), the window is kept ALIVE on a Hyprland special (scratchpad) workspace and merely
# shown/hidden:
#   • first click  → start serve.py if needed, reveal the empty special workspace, spawn chromium
#                    onto it (the float/size/move rule in hypr-squawkr-widget.lua docks it);
#   • later clicks → `hyprctl dispatch togglespecialworkspace squawkr` — instant show/hide, no
#                    relaunch, serve.py and chromium stay running.
# The "Full service →" link still calls serve.py /__open which closes the panel window; the next
# click just respawns it. Without hyprctl (non-Hyprland) it falls back to plain spawn.
#
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
WS="squawkr"   # Hyprland special-workspace name (special:squawkr)

have_hypr() { command -v hyprctl >/dev/null 2>&1 && [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; }
panel_open() { hyprctl -j clients 2>/dev/null | grep -q "\"${WINCLASS}\""; }

ensure_server() {
  if ! curl -sf -o /dev/null "$URL" 2>/dev/null; then
    setsid python3 "$SERVE" "$APP_DIR" >/dev/null 2>&1 &
    for _ in $(seq 1 40); do curl -sf -o /dev/null "$URL" && break; sleep 0.15; done
  fi
}

spawn_panel() {
  # chromium ignores --class for --app under Wayland (it derives app_id from the URL); the Hyprland
  # rule matches that derived class. --no-first-run avoids a fresh-profile stall.
  setsid uwsm-app -- chromium --app="$URL" \
    --user-data-dir="${XDG_DATA_HOME:-$HOME/.local/share}/squawkr-widget/chrome" \
    --no-first-run --no-default-browser-check >/dev/null 2>&1 &
}

if ! have_hypr; then
  # No Hyprland — no scratchpad. Fall back to the simple open (best effort).
  ensure_server
  spawn_panel
  exit 0
fi

if panel_open; then
  # Alive already → just flip the scratchpad. Instant, keeps chromium + serve.py running.
  hyprctl dispatch togglespecialworkspace "$WS" >/dev/null 2>&1
  exit 0
fi

# First open: server up, reveal the (empty) special workspace so the new window lands on it, spawn.
ensure_server
hyprctl dispatch togglespecialworkspace "$WS" >/dev/null 2>&1 || true
spawn_panel
exit 0
