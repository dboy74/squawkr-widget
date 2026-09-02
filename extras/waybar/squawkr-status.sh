#!/usr/bin/env bash
# Waybar custom module for Squawkr: prints the home field's flight category + wind as a compact
# toolbar summary, coloured via a Waybar CSS class. on-click launches the widget panel.
#
# Emits one line of Waybar JSON: {"text","tooltip","class"}. Talks to the SAME protected plugin
# API the widget uses; it self-provisions and caches a per-install token (POST /plugin/token) at
# ~/.config/squawkr/plugin-token so the module and the widget are independent installs.
set -euo pipefail

API_BASE="${SQUAWKR_API:-https://plugin-api.squawkr.net}"
CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/squawkr"
TOKEN_FILE="$CFG_DIR/plugin-token"
HOME_FILE="$CFG_DIR/home"
HOME_ICAO="$(cat "$HOME_FILE" 2>/dev/null || echo "${SQUAWKR_HOME:-ESSV}")"
mkdir -p "$CFG_DIR"

emit() { printf '%s\n' "$1"; exit 0; }

# Ensure a token (self-provision once, cache it).
TOKEN="$(cat "$TOKEN_FILE" 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  TOKEN="$(curl -sf -X POST "$API_BASE/plugin/token" -H 'content-type: application/json' \
            -d '{"label":"waybar module"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true)"
  [ -n "$TOKEN" ] && { printf '%s' "$TOKEN" > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"; }
fi
[ -z "$TOKEN" ] && emit '{"text":"SQWK ?","tooltip":"Squawkr: no API token","class":"unknown"}'

JSON="$(curl -sf -H "authorization: Bearer $TOKEN" "$API_BASE/plugin/airfields/$HOME_ICAO" 2>/dev/null || true)"
[ -z "$JSON" ] && emit "{\"text\":\"$HOME_ICAO —\",\"tooltip\":\"Squawkr: API unreachable\",\"class\":\"unknown\"}"

HOME_ICAO="$HOME_ICAO" SQWK_JSON="$JSON" python3 - <<'PY'
import json, os
icao = os.environ["HOME_ICAO"]
try:
    d = json.loads(os.environ["SQWK_JSON"])
except Exception:
    print(f'{{"text":"{icao} —","tooltip":"Squawkr: bad response","class":"unknown"}}'); raise SystemExit
data = d.get("data") or {}
m = data.get("metar") or {}
cat = m.get("flightCategory") or "—"
if m.get("raw") and "CAVOK" in m["raw"]: cat = "CAVOK"
wdir = m.get("windDir"); wspd = m.get("windSpeedKt")
age = (d.get("dataAge") or {}).get("metar")  # seconds
cls = {"CAVOK":"vfr","VFR":"vfr","MVFR":"mvfr","IFR":"ifr","LIFR":"lifr"}.get(cat, "unknown")
stale = d.get("stale") or (age is not None and age > 90*60)
if stale: cls = "unknown"
wind = f"{wdir:03d}°{wspd}kt" if (wdir is not None and wspd is not None) else "calm"
text = f"{icao} {cat}"
tip = f"{icao} {data.get('name','')}\\n{cat} · wind {wind}"
if m.get("raw"): tip += "\\n" + m["raw"]
if stale: tip += "\\n(data may be stale — open the panel)"
print(json.dumps({"text": text, "tooltip": tip, "class": cls}))
PY
