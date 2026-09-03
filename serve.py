#!/usr/bin/env python3
"""Tiny loopback server for the Squawkr Omarchy panel.

Serves the static app (like `python3 -m http.server`) and adds two control routes the panel
uses for standard toolbar-panel behaviour:

  GET /__open?url=<https squawkr url>[&close=1]  → open the URL in the user's real browser
                                                    (xdg-open); with close=1, then shut the panel.
  GET /__close                                   → shut the panel.

"Shut the panel" closes the chromium --app window by terminating that chromium instance (matched
by its unique `--app=…/index.html` flag, so this server, xdg-open and pkill never match themselves).
The server itself keeps running, so the next toolbar click reopens instantly.

Bound to 127.0.0.1 only; /__open only accepts http(s) URLs on squawkr.se / squawkr.net.
"""
import os, re, sys, time, signal, threading, urllib.parse, http.server, socketserver
try:
    import tomllib  # py3.11+
except Exception:
    tomllib = None

DIRECTORY = sys.argv[1] if len(sys.argv) > 1 else "."
PORT = int(os.environ.get("SQUAWKR_WIDGET_PORT", "8770"))
ALLOWED_HOST = re.compile(r"^([a-z0-9-]+\.)?squawkr\.(se|net)$", re.I)
APP_FLAG = ("--app=http://127.0.0.1:%d/index.html" % PORT).encode()


def close_panel(delay=0.0):
    """Terminate the chromium --app panel window (only), after an optional delay so an HTTP
    response can flush first. Never matches this server or xdg-open (they lack --app=…/index.html)."""
    def _do():
        if delay:
            time.sleep(delay)
        me = os.getpid()
        for pid in os.listdir("/proc"):
            if not pid.isdigit() or int(pid) == me:
                continue
            try:
                cl = open("/proc/%s/cmdline" % pid, "rb").read()
            except OSError:
                continue
            if APP_FLAG in cl:
                try:
                    os.kill(int(pid), signal.SIGTERM)
                except OSError:
                    pass
    threading.Thread(target=_do, daemon=True).start()



# ---- Omarchy theme inheritance -----------------------------------------------------------------
# Read the active Omarchy theme's palette + terminal font and emit CSS-variable overrides the panel
# loads after styles.css (see index.html). Purely local reads; any failure yields "" so the panel
# falls back to its built-in dark theme (and works fine off Omarchy). Colours come from the theme's
# alacritty.toml (primary bg/fg + ANSI blue for the accent); the font from ~/.config/alacritty.
STATE_THEME = os.path.expanduser("~/.local/state/omarchy/current/theme")
ALACRITTY_USER = os.path.expanduser("~/.config/alacritty/alacritty.toml")


def _hex(v):
    if not isinstance(v, str):
        return None
    v = v.strip().lstrip("#")
    if v[:2].lower() == "0x":
        v = v[2:]
    if len(v) != 6:
        return None
    try:
        return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def _hx(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c)))) for c in rgb)


def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _lum(rgb):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _theme_css():
    if tomllib is None:
        return ""
    try:
        with open(os.path.join(STATE_THEME, "alacritty.toml"), "rb") as fh:
            t = tomllib.load(fh)
        colors = t.get("colors", {}) or {}
        prim = colors.get("primary", {}) or {}
        bg = _hex(prim.get("background"))
        fg = _hex(prim.get("foreground"))
        if not bg or not fg:
            return ""
        normal = colors.get("normal", {}) or {}
        bright = colors.get("bright", {}) or {}
        font = None
        try:
            with open(ALACRITTY_USER, "rb") as fh:
                fa = tomllib.load(fh)
            font = (((fa.get("font") or {}).get("normal")) or {}).get("family")
        except Exception:
            font = None
        dark = _lum(bg) < 0.5
        pole = (255, 255, 255) if dark else (0, 0, 0)
        accent = _hex(bright.get("blue")) or _hex(normal.get("blue")) or fg
        if abs(_lum(accent) - _lum(bg)) < 0.12:   # too low-contrast to read → use the text colour
            accent = fg
        v = {
            "--panel": _hx(bg),
            "--bg": _hx(_mix(bg, (0, 0, 0) if dark else (255, 255, 255), 0.10)),
            "--surface2": _hx(_mix(bg, fg, 0.06)),
            "--hover": _hx(_mix(bg, fg, 0.11)),
            "--edge": _hx(_mix(bg, fg, 0.22)),
            "--ink": _hx(fg),
            "--strong": _hx(_mix(fg, pole, 0.28)),
            "--mut": _hx(_mix(fg, bg, 0.45)),
            "--val": _hx(accent),
            "--big": _hx(accent),
        }
        if font:
            fam = '"%s"' % font
            v["--sans"] = fam + ',"IBM Plex Sans",system-ui,sans-serif'
            v["--mono"] = fam + ',"IBM Plex Mono",monospace'
        body = ";".join("%s:%s" % (k, val) for k, val in v.items())
        return "/* Omarchy theme (%s) */\n:root{%s;}\n" % ("dark" if dark else "light", body)
    except Exception:
        return ""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIRECTORY, **k)

    def end_headers(self):
        # Never serve a stale panel. The app is tiny and same-origin, so freshness beats caching:
        # without this, chromium keeps the old JS/CSS after an update and the UI looks unchanged
        # until a manual hard-reload. no-store makes every open fetch the current files.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def _noContent(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/theme.css":
            css = _theme_css().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/css; charset=utf-8")
            self.send_header("Content-Length", str(len(css)))
            self.end_headers()
            try:
                self.wfile.write(css)
            except OSError:
                pass
            return
        if u.path == "/__open":
            q = urllib.parse.parse_qs(u.query)
            url = (q.get("url") or [""])[0]
            p = urllib.parse.urlparse(url)
            if p.scheme in ("http", "https") and ALLOWED_HOST.match(p.hostname or ""):
                import subprocess
                subprocess.Popen(["xdg-open", url],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self._noContent()
                if (q.get("close") or ["0"])[0] == "1":
                    try:
                        self.wfile.flush()
                    except OSError:
                        pass
                    close_panel(delay=0.25)
            else:
                self.send_response(400)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return
        if u.path == "/__close":
            self._noContent()
            try:
                self.wfile.flush()
            except OSError:
                pass
            close_panel(delay=0.25)
            return
        return super().do_GET()

    def log_message(self, *a):
        pass


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
