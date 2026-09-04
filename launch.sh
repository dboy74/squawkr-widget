#!/usr/bin/env bash
# Toggle the Squawkr widget panel on Omarchy / Hyprland — fast, like a native scratchpad.
#
# The panel is a chromium --app window served over http by serve.py (file:// blocks ES modules).
# To make toggling INSTANT (native plugins pop in/out immediately; relaunching chromium each click
# took seconds), the window is kept ALIVE on a Hyprland special (scratchpad) workspace and merely
# shown/hidden:
#   • no panel window yet → start serve.py if needed, spawn chromium; the Hyprland rule in
#                            hypr-squawkr-widget.lua puts it on special:squawkr (floated, sized,
#                            docked under the bar icon) and reveals that workspace;
#   • panel window alive  → toggle special:squawkr — instant show/hide, no relaunch, serve.py and
#                            chromium stay running.
# The "Full service →" link still calls serve.py /__open which closes the panel window; the next
# click just respawns it. Without hyprctl (non-Hyprland) it falls back to plain spawn.
#
# Hyprland ≥ 0.5x (what Omarchy ships, with its Lua config) parses `hyprctl dispatch` arguments
# as Lua — the classic `togglespecialworkspace squawkr` form is a Lua syntax error there and does
# nothing (that was the "opens but won't close" bug: the toggle never ran, chromium landed on the
# current normal workspace, and every later click failed the same silent way). hypr_dsp() below
# issues the Lua form first and falls back to the classic form on older Hyprland releases.
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
LOCK="${XDG_RUNTIME_DIR:-/tmp}/squawkr-widget-launch.lock"

have_hypr() { command -v hyprctl >/dev/null 2>&1 && [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; }

# Workspace name the panel window is on ("" when there is no panel window).
panel_ws() {
  hyprctl -j clients 2>/dev/null | WINCLASS="$WINCLASS" python3 -c '
import json, os, sys
try:
    for c in json.load(sys.stdin):
        if c.get("class") == os.environ["WINCLASS"]:
            print(c.get("workspace", {}).get("name", "")); break
except Exception:
    pass' 2>/dev/null || true
}

# Is special:squawkr currently shown on any monitor?
special_shown() {
  hyprctl -j monitors 2>/dev/null | WS="$WS" python3 -c '
import json, os, sys
try:
    ok = any(m.get("specialWorkspace", {}).get("name") == "special:" + os.environ["WS"] for m in json.load(sys.stdin))
except Exception:
    ok = False
sys.exit(0 if ok else 1)' 2>/dev/null
}

# Run a Hyprland dispatcher: Lua form (current Hyprland) first, classic form as the fallback.
# `hyprctl dispatch` prints "ok" on success and an error message otherwise (its exit code alone
# is not reliable across releases), so the output is checked.
hypr_dsp() {
  local lua="$1" classic="${2:-}" out
  out="$(hyprctl dispatch "$lua" 2>&1)" || true
  case "$out" in ok*) return 0;; esac
  [ -n "$classic" ] || return 1
  # shellcheck disable=SC2086
  out="$(hyprctl dispatch $classic 2>&1)" || true
  case "$out" in ok*) return 0;; esac
  return 1
}

toggle_special() {
  hypr_dsp "hl.dsp.workspace.toggle_special('$WS')" "togglespecialworkspace $WS"
}

# Put a stray panel window (one that landed on a normal workspace) onto special:squawkr, silently.
move_panel_to_special() {
  # (Plain dots in the class pattern: Lua strings reject "\." and a dot matches itself anyway.)
  hypr_dsp "hl.dsp.window.move({ workspace = 'special:$WS', follow = false, window = hl.get_windows({ class = '^${WINCLASS}\$' })[1] })" \
           "movetoworkspacesilent special:$WS,class:^(${WINCLASS})\$"
}

ensure_server() {
  if ! curl -sf -o /dev/null "$URL" 2>/dev/null; then
    setsid python3 "$SERVE" "$APP_DIR" >/dev/null 2>&1 9>&- &
    for _ in $(seq 1 40); do curl -sf -o /dev/null "$URL" && break; sleep 0.15; done
  fi
}

spawn_panel() {
  # chromium ignores --class for --app under Wayland (it derives app_id from the URL); the Hyprland
  # rule matches that derived class. --no-first-run avoids a fresh-profile stall. 9>&- keeps the
  # click lock (fd 9) out of the long-lived child, or it would hold the lock forever.
  setsid uwsm-app -- chromium --app="$URL" \
    --user-data-dir="${XDG_DATA_HOME:-$HOME/.local/share}/squawkr-widget/chrome" \
    --no-first-run --no-default-browser-check >/dev/null 2>&1 9>&- &
}

if ! have_hypr; then
  # No Hyprland — no scratchpad. Fall back to the simple open (best effort).
  ensure_server
  spawn_panel
  exit 0
fi

# One click at a time: a second click while chromium is still starting is dropped rather than
# spawning a second panel (or toggling the half-born one away).
exec 9>"$LOCK"
flock -n 9 || exit 0

ws="$(panel_ws)"
if [ -n "$ws" ]; then
  # Alive already → make sure it lives on the scratchpad, then flip it. Instant; chromium and
  # serve.py keep running (serve.py is restarted if it died — a loopback probe costs ~1 ms).
  ensure_server
  if [ "$ws" != "special:$WS" ]; then
    # Stray on a normal workspace (spawned by an older launcher). Moving it silently hides it —
    # exactly "close" if it was on screen; if it was on another workspace, show it instead.
    active="$(hyprctl -j activeworkspace 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))' 2>/dev/null || true)"
    move_panel_to_special || true
    if [ "$ws" != "$active" ]; then special_shown || toggle_special || true; fi
    exit 0
  fi
  toggle_special || true
  exit 0
fi

# No panel window (first open, or chromium died / was closed by the "Full service" link):
# server up, spawn, and wait for the window so a fast second click sees it. The Hyprland
# `workspace = "special:squawkr"` rule lands it on the scratchpad and reveals it; if that rule is
# missing or chromium mapped elsewhere, move it there and show it ourselves.
ensure_server
spawn_panel
for _ in $(seq 1 60); do
  sleep 0.15
  ws="$(panel_ws)"
  [ -n "$ws" ] && break
done
if [ -n "$ws" ] && [ "$ws" != "special:$WS" ]; then
  move_panel_to_special || true
fi
if [ -n "$ws" ]; then
  special_shown || toggle_special || true
fi
exit 0
