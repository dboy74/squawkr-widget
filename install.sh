#!/usr/bin/env bash
# Install the Squawkr widget as a native Omarchy (Quickshell) status-bar plugin — a logo in the
# bar that opens the panel on click. All additive and reversible; configs are backed up, never
# clobbered, and nothing under /usr/share/omarchy is touched.
#
#   ./install.sh            copy the app, launcher and bar plugin; PRINT the config steps.
#   ./install.sh --wire     also register the bar module in shell.json and add the Hyprland float
#                           rule, backing up each file first, then reload the shell + Hyprland.
#
# (Omarchy's Quickshell shell is what this rig runs. For Waybar-based setups the extras/waybar/ dir here
#  provides an equivalent module — see README.md.)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="$(cd "$SRC/app" && pwd)"
APP_DST="$HOME/.local/share/squawkr-widget/app"
BIN="$HOME/.local/bin"
PLUGINS="$HOME/.config/omarchy/plugins"
WIRE=0; [ "${1:-}" = "--wire" ] && WIRE=1

backup() { [ -f "$1" ] && cp "$1" "$1.bak.$(date +%s)" && echo "  (backed up $1)"; }

mkdir -p "$APP_DST" "$BIN" "$PLUGINS/squawkr"

# 1. the web app (served on loopback by the launcher)
cp -r "$APP_SRC/." "$APP_DST/"
echo "✓ app        → $APP_DST"

# 2. the launcher (toggle) + its loopback server (static app + /__open, /__close routes)
install -m 755 "$SRC/launch.sh" "$BIN/squawkr-widget-launch.sh"
echo "✓ launcher   → $BIN/squawkr-widget-launch.sh"
install -m 755 "$SRC/serve.py" "$APP_DST/../serve.py"
echo "✓ server     → $(cd "$APP_DST/.." && pwd)/serve.py"

# 3. the Quickshell bar plugin (logo + click-to-open)
cp "$SRC"/omarchy-plugin/squawkr/{manifest.json,BarWidget.qml,squawkr-mark.svg} "$PLUGINS/squawkr/"
echo "✓ bar plugin → $PLUGINS/squawkr/"

# 4. a running panel keeps the OLD app in memory (the window stays alive between toggles), and a
#    running serve.py is the old server — close both so the next click loads what was just
#    installed. Also drop the app profile's HTTP caches (served no-store, so this is belt and
#    braces). The [.] keeps pkill from matching this script's own command line.
PORT="${SQUAWKR_WIDGET_PORT:-8770}"
if pkill -f "app=http://127.0.0.1:${PORT}/index[.]html" 2>/dev/null; then echo "✓ closed the running panel (next click reopens it with the new app)"; fi
if pkill -f "squawkr-widget/serve[.]py" 2>/dev/null; then echo "✓ stopped the old serve.py (restarts on next click)"; fi
CHROME="${XDG_DATA_HOME:-$HOME/.local/share}/squawkr-widget/chrome"
rm -rf "$CHROME/Default/Cache" "$CHROME/Default/Code Cache" "$CHROME/Default/GPUCache" 2>/dev/null || true
echo

SHELL_JSON="$HOME/.config/omarchy/shell.json"
HYPR="$HOME/.config/hypr/hyprland.lua"

if [ "$WIRE" = "1" ]; then
  echo "Wiring shell.json (bar module) and hyprland.lua (float rule)…"
  # 3a. add the module to the bar, start of the RIGHT group — idempotent. Right, not centre,
  #     so a centred display notch (e.g. a MacBook) doesn't hide it.
  backup "$SHELL_JSON"
  python3 - "$SHELL_JSON" <<'PY'
import json, sys, pathlib
p = pathlib.Path(sys.argv[1]); cfg = json.loads(p.read_text()); lay = cfg["bar"]["layout"]
for g in ("left", "center", "right"):
    lay[g] = [w for w in lay.get(g, []) if w.get("id") != "squawkr.panel"]
lay.setdefault("right", []).insert(0, {"id": "squawkr.panel"})
p.write_text(json.dumps(cfg, indent=2) + "\n")
print("  ✓ shell.json right:", [w.get("id") for w in lay["right"]])
PY
  omarchy-shell shell reloadConfig >/dev/null 2>&1 && echo "  ✓ shell reloaded"
  # 3b. append the Hyprland float/size/dock rule — idempotent. Right-justify below the bar icon:
  #     x = monitor_width - 612 (600px panel + 12px margin). Numeric because the helper centres a
  #     relative "100%-.." move. Fall back to a 1920-wide guess if hyprctl can't be read.
  #     An older Squawkr block (one without the `workspace = "special:squawkr"` rule the instant
  #     toggle relies on) is removed line-by-line first, so an update gets the current rules.
  if grep -q "chrome-127.0.0.1__index.html-Default" "$HYPR" 2>/dev/null && \
     ! grep -q 'special:squawkr' "$HYPR" 2>/dev/null; then
    backup "$HYPR"
    python3 - "$HYPR" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); lines = p.read_text().splitlines()
KEY = "chrome-127.0.0.1__index.html-Default"
drop = {i for i, l in enumerate(lines) if KEY in l}
if drop:
    # also drop the comment lines directly above the first rule (the block's own header)
    i = min(drop) - 1
    while i >= 0 and lines[i].lstrip().startswith("--") and "Squawkr" in " ".join(lines[max(0, i - 3):min(drop)]):
        drop.add(i); i -= 1
out = [l for i, l in enumerate(lines) if i not in drop]
p.write_text("\n".join(out).rstrip("\n") + "\n")
PY
    echo "  ✓ removed the previous Squawkr rule block from $HYPR (will re-add the current one)"
  fi
  if ! grep -q "chrome-127.0.0.1__index.html-Default" "$HYPR" 2>/dev/null; then
    backup "$HYPR"
    MON_W="$(hyprctl -j monitors 2>/dev/null | python3 -c 'import sys,json
try:
    m=json.load(sys.stdin)[0]; print(round(m["width"]/m.get("scale",1)))
except Exception: print(1920)' 2>/dev/null || echo 1920)"
    PANEL_X=$(( MON_W - 612 )); [ "$PANEL_X" -lt 12 ] && PANEL_X=12
    { echo ""; echo "-- Squawkr widget panel (added by the Squawkr plugin installer)"; \
      sed "s/__PANEL_X__/$PANEL_X/" "$SRC/hypr-squawkr-widget.lua"; } >> "$HYPR"
    hyprctl reload >/dev/null 2>&1 && echo "  ✓ hyprland.lua appended (panel x=$PANEL_X for ${MON_W}px monitor) and reloaded"
  else
    echo "  (float rule already present in $HYPR)"
  fi
  echo
  echo "Done — the Squawkr logo is in your bar. Click it to open the panel."
else
  cat <<STEPS
NOT modifying your config. Add these two things (or re-run with --wire):

1. Bar module — add {"id":"squawkr.panel"} to bar.layout.center in ~/.config/omarchy/shell.json
   (e.g. right after "omarchy.clock"), then:  omarchy-shell shell reloadConfig

2. Float rule — append to ~/.config/hypr/hyprland.lua, then  hyprctl reload:

$(sed 's/^/    /' "$SRC/hypr-squawkr-widget.lua")

Config: the launcher serves the app on http://127.0.0.1:${SQUAWKR_WIDGET_PORT:-8770}. Point the
app at another API by editing its config.js (API_BASE). See README.md.
STEPS
fi
